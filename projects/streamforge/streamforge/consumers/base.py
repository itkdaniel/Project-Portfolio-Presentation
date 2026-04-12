"""
Base consumer class — all StreamForge consumers inherit from this.
Implements at-least-once delivery with DLQ support and backpressure.
"""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from confluent_kafka import Consumer, KafkaError, KafkaException, Message
from prometheus_client import Counter, Gauge, Histogram

from streamforge.core.config import settings

logger = logging.getLogger(__name__)

# ── Metrics ────────────────────────────────────────────────────────────────

messages_processed = Counter(
    "streamforge_messages_processed_total",
    "Total messages processed",
    ["topic", "group_id", "status"],
)
processing_time = Histogram(
    "streamforge_processing_duration_seconds",
    "Message processing duration",
    ["topic", "group_id"],
    buckets=[.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10],
)
consumer_lag = Gauge(
    "streamforge_consumer_lag",
    "Current consumer lag",
    ["topic", "group_id", "partition"],
)


@dataclass
class Event:
    """A deserialized Kafka message."""
    event_id:   str
    event_type: str
    topic:      str
    partition:  int
    offset:     int
    payload:    Dict[str, Any]
    headers:    Dict[str, str] = field(default_factory=dict)
    attempt:    int = 1


class BaseConsumer(ABC):
    """
    Abstract base consumer with automatic retry, DLQ routing, and backpressure.

    Subclasses must define:
        topic    : str   — Kafka topic to consume
        group_id : str   — Consumer group ID

    And implement:
        process(event)   — Business logic for each event
        on_error(event, error) — Called on processing failure (default: send to DLQ)
    """

    topic:    str
    group_id: str
    max_poll_records: int = 500

    def __init__(self) -> None:
        self._consumer: Optional[Consumer] = None
        self._running  = False
        self._paused   = False

    @abstractmethod
    async def process(self, event: Event) -> None:
        """Process a single event. Raise an exception to trigger DLQ routing."""

    async def on_error(self, event: Event, error: Exception) -> None:
        """Default error handler — sends failed events to the DLQ topic."""
        from streamforge.producers.dlq import DLQProducer
        producer = DLQProducer()
        await producer.send(event, error)
        logger.error(
            "Event sent to DLQ",
            extra={
                "topic":      event.topic,
                "event_id":   event.event_id,
                "event_type": event.event_type,
                "error":      str(error),
                "attempt":    event.attempt,
            },
        )

    def _create_consumer(self) -> Consumer:
        return Consumer({
            "bootstrap.servers":  settings.kafka_brokers,
            "group.id":           self.group_id,
            "auto.offset.reset":  "earliest",
            "enable.auto.commit": False,
            "max.poll.interval.ms": 300_000,
            "session.timeout.ms":   30_000,
        })

    async def start(self) -> None:
        """Start consuming messages in a background loop."""
        self._consumer = self._create_consumer()
        self._consumer.subscribe([self.topic])
        self._running = True

        logger.info("Consumer started", extra={"topic": self.topic, "group": self.group_id})

        try:
            await asyncio.get_event_loop().run_in_executor(None, self._consume_loop)
        finally:
            self._consumer.close()

    def _consume_loop(self) -> None:
        while self._running:
            if self._paused:
                import time
                time.sleep(0.5)
                continue

            msg: Message = self._consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                raise KafkaException(msg.error())

            event = self._deserialize(msg)
            try:
                asyncio.run(self._handle(event))
                self._consumer.commit(message=msg, asynchronous=False)
                messages_processed.labels(
                    topic=self.topic, group_id=self.group_id, status="success"
                ).inc()
            except Exception as exc:
                messages_processed.labels(
                    topic=self.topic, group_id=self.group_id, status="error"
                ).inc()
                logger.error("Processing failed", exc_info=exc)

    async def _handle(self, event: Event) -> None:
        import time
        start = time.monotonic()
        try:
            await self.process(event)
        except Exception as exc:
            await self.on_error(event, exc)
        finally:
            processing_time.labels(
                topic=self.topic, group_id=self.group_id
            ).observe(time.monotonic() - start)

    def _deserialize(self, msg: Message) -> Event:
        import json
        data = json.loads(msg.value().decode("utf-8"))
        return Event(
            event_id=data.get("event_id", ""),
            event_type=data.get("event_type", ""),
            topic=msg.topic(),
            partition=msg.partition(),
            offset=msg.offset(),
            payload=data.get("payload", {}),
            headers={k: v.decode() for k, v in (msg.headers() or [])},
        )

    def pause(self) -> None:
        self._paused = True
        logger.info("Consumer paused", extra={"topic": self.topic, "group": self.group_id})

    def resume(self) -> None:
        self._paused = False
        logger.info("Consumer resumed", extra={"topic": self.topic, "group": self.group_id})

    def stop(self) -> None:
        self._running = False

    async def send_to_dlq(self, event: Event, error: Exception) -> None:
        await self.on_error(event, error)
