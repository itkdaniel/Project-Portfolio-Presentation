"""
POST /v1/analytics/events — ingest a single API call event.

This endpoint is called fire-and-forget by any NexusConsult service (or the
Express gateway) whenever it handles an API request.  The body is small and
the insert is fast; latency impact on the caller is negligible.

Design notes
────────────
- ``ts`` defaults to ``time.time()`` if the caller omits it, keeping the
  insert idempotent even when clocks drift slightly.
- The endpoint intentionally returns 201 with the created event so callers
  can verify the payload was accepted.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_dep
from app.models import ApiEvent, EventCreate, EventOut

router = APIRouter(prefix="/v1/analytics", tags=["events"])


@router.post(
    "/events",
    status_code=201,
    response_model=EventOut,
    summary="Record one API call event",
    description=(
        "Ingest a single structured API-call record.  Call this from any "
        "NexusConsult sub-app or from the Express gateway after each request."
    ),
)
async def create_event(
    body: EventCreate,
    db: AsyncSession = Depends(get_db_dep),
) -> EventOut:
    """Insert one ApiEvent row and return it."""
    event = ApiEvent(
        service=body.service,
        method=body.method,
        endpoint=body.endpoint,
        status_code=body.status_code,
        latency_ms=body.latency_ms,
        error=body.error,
        ts=body.ts if body.ts is not None else time.time(),
    )
    db.add(event)
    await db.flush()   # get the auto-generated id before commit
    await db.refresh(event)
    return EventOut.model_validate(event)
