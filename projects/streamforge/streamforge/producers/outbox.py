"""
Outbox producer — writes events to the PostgreSQL outbox table within a transaction.
A background relay process polls the outbox and publishes to Kafka.
This guarantees at-least-once delivery without 2PC.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from streamforge.core.database import get_db
from streamforge.models.outbox import OutboxMessage, OutboxStatus

logger = logging.getLogger(__name__)


class OutboxPublisher:
    """
    Publishes events via the transactional outbox pattern.

    Usage:
        async with db.begin():
            await db.execute("INSERT INTO orders ...")
            await OutboxPublisher.publish(
                db=db,
                topic="orders",
                event_type="order.created",
                payload={"order_id": ...},
            )
    """

    @staticmethod
    async def publish(
        db: AsyncSession,
        topic: str,
        event_type: str,
        payload: Dict[str, Any],
        partition_key: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> OutboxMessage:
        """Write an event to the outbox table. Must be called inside a transaction."""
        msg = OutboxMessage(
            id=f"evt_{uuid.uuid4().hex[:20]}",
            topic=topic,
            event_type=event_type,
            payload=json.dumps(payload),
            partition_key=partition_key,
            headers=json.dumps(headers or {}),
            status=OutboxStatus.PENDING,
            created_at=datetime.utcnow(),
        )
        db.add(msg)
        # Note: commit happens in the caller's transaction
        return msg


class OutboxRelay:
    """
    Background relay — polls the outbox table and publishes to Kafka.
    Runs as a separate process/coroutine.
    """

    def __init__(
        self,
        poll_interval_ms: int = 100,
        batch_size: int = 100,
        lock_timeout_ms: int = 5000,
    ) -> None:
        self.poll_interval = poll_interval_ms / 1000
        self.batch_size    = batch_size
        self.lock_timeout  = lock_timeout_ms / 1000
        self._running      = False

    async def start(self) -> None:
        self._running = True
        logger.info("OutboxRelay started")
        while self._running:
            try:
                published = await self._relay_batch()
                if published == 0:
                    await asyncio.sleep(self.poll_interval)
            except Exception as exc:
                logger.error("Relay error", exc_info=exc)
                await asyncio.sleep(1.0)

    async def _relay_batch(self) -> int:
        from streamforge.core.kafka import get_producer

        async with get_db() as db:
            # Lock a batch of pending messages using SELECT FOR UPDATE SKIP LOCKED
            from sqlalchemy import text
            result = await db.execute(text("""
                SELECT id, topic, event_type, payload, partition_key, headers
                FROM outbox_messages
                WHERE status = 'pending'
                ORDER BY created_at
                LIMIT :limit
                FOR UPDATE SKIP LOCKED
            """), {"limit": self.batch_size})
            rows = result.fetchall()

            if not rows:
                return 0

            producer = get_producer()
            published = 0

            for row in rows:
                try:
                    producer.produce(
                        topic=row.topic,
                        key=row.partition_key,
                        value=json.dumps({
                            "event_id":   row.id,
                            "event_type": row.event_type,
                            "payload":    json.loads(row.payload),
                        }),
                        headers=json.loads(row.headers or "{}"),
                    )
                    await db.execute(text(
                        "UPDATE outbox_messages SET status = 'published', published_at = NOW() WHERE id = :id"
                    ), {"id": row.id})
                    published += 1
                except Exception as exc:
                    logger.error("Failed to publish", extra={"id": row.id}, exc_info=exc)
                    await db.execute(text(
                        "UPDATE outbox_messages SET status = 'failed', error = :err WHERE id = :id"
                    ), {"id": row.id, "err": str(exc)})

            producer.flush()
            await db.commit()
            return published

    def stop(self) -> None:
        self._running = False
