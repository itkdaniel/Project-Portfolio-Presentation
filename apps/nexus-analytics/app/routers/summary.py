"""
Analytics summary endpoints — aggregate statistics over stored api_events.

Endpoints
─────────
GET /v1/analytics/summary          — per-service call counts + latency stats
GET /v1/analytics/top-endpoints    — top N endpoints by call volume
GET /v1/analytics/errors           — error-rate breakdown per service
GET /v1/analytics/timeseries       — bucketed call counts over a time window
"""
from __future__ import annotations

import math
import time
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_dep
from app.models import (
    ApiEvent,
    EndpointSummary,
    ServiceSummary,
    TimeseriesPoint,
)

router = APIRouter(prefix="/v1/analytics", tags=["analytics"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _p95(values: list[float]) -> float:
    """Return the 95th-percentile of ``values`` (sorted ascending)."""
    if not values:
        return 0.0
    sorted_v = sorted(values)
    idx = max(0, math.ceil(0.95 * len(sorted_v)) - 1)
    return round(sorted_v[idx], 2)


# ── routes ────────────────────────────────────────────────────────────────────

@router.get(
    "/summary",
    response_model=list[ServiceSummary],
    summary="Per-service aggregate statistics",
    description=(
        "Returns call count, success/error split, average latency, and p95 "
        "latency for every distinct service seen in the last ``hours`` hours."
    ),
)
async def get_summary(
    hours: int = Query(24, ge=1, le=720, description="Look-back window in hours"),
    db: AsyncSession = Depends(get_db_dep),
) -> list[ServiceSummary]:
    since = time.time() - hours * 3600
    rows = (
        await db.execute(
            select(
                ApiEvent.service,
                ApiEvent.latency_ms,
                ApiEvent.status_code,
            ).where(ApiEvent.ts >= since)
        )
    ).all()

    # Aggregate in Python — avoids dialect-specific SQL for latency percentiles.
    buckets: dict[str, dict] = defaultdict(
        lambda: {"total": 0, "success": 0, "error": 0, "latencies": []}
    )
    for service, latency_ms, status_code in rows:
        b = buckets[service]
        b["total"] += 1
        b["latencies"].append(latency_ms)
        if 200 <= status_code < 300:
            b["success"] += 1
        else:
            b["error"] += 1

    result: list[ServiceSummary] = []
    for service, b in sorted(buckets.items()):
        total = b["total"]
        lats = b["latencies"]
        result.append(
            ServiceSummary(
                service=service,
                total_calls=total,
                success_calls=b["success"],
                error_calls=b["error"],
                success_rate=round(b["success"] / total, 4) if total else 0.0,
                avg_latency_ms=round(sum(lats) / len(lats), 2) if lats else 0.0,
                p95_latency_ms=_p95(lats),
            )
        )
    return result


@router.get(
    "/top-endpoints",
    response_model=list[EndpointSummary],
    summary="Top N endpoints by call volume",
)
async def get_top_endpoints(
    limit: int = Query(20, ge=1, le=100),
    hours: int = Query(24, ge=1, le=720),
    service: Optional[str] = Query(None, description="Filter to one service"),
    db: AsyncSession = Depends(get_db_dep),
) -> list[EndpointSummary]:
    since = time.time() - hours * 3600
    stmt = select(
        ApiEvent.service,
        ApiEvent.method,
        ApiEvent.endpoint,
        ApiEvent.latency_ms,
        ApiEvent.status_code,
    ).where(ApiEvent.ts >= since)
    if service:
        stmt = stmt.where(ApiEvent.service == service)
    rows = (await db.execute(stmt)).all()

    # Aggregate by (service, method, endpoint)
    key_buckets: dict[tuple, dict] = defaultdict(
        lambda: {"total": 0, "errors": 0, "latencies": []}
    )
    for svc, method, endpoint, latency_ms, status_code in rows:
        key = (svc, method, endpoint)
        b = key_buckets[key]
        b["total"] += 1
        b["latencies"].append(latency_ms)
        if status_code >= 400:
            b["errors"] += 1

    sorted_keys = sorted(
        key_buckets.keys(), key=lambda k: key_buckets[k]["total"], reverse=True
    )[:limit]

    result: list[EndpointSummary] = []
    for svc, method, endpoint in sorted_keys:
        b = key_buckets[(svc, method, endpoint)]
        lats = b["latencies"]
        result.append(
            EndpointSummary(
                service=svc,
                method=method,
                endpoint=endpoint,
                total_calls=b["total"],
                avg_latency_ms=round(sum(lats) / len(lats), 2) if lats else 0.0,
                error_rate=round(b["errors"] / b["total"], 4) if b["total"] else 0.0,
            )
        )
    return result


@router.get(
    "/errors",
    response_model=list[ServiceSummary],
    summary="Error-rate breakdown per service",
    description="Same shape as /summary but filtered to only services that have errors.",
)
async def get_errors(
    hours: int = Query(24, ge=1, le=720),
    min_error_rate: float = Query(0.0, ge=0, le=1),
    db: AsyncSession = Depends(get_db_dep),
) -> list[ServiceSummary]:
    all_summaries = await get_summary(hours=hours, db=db)
    return [s for s in all_summaries if s.error_rate >= min_error_rate and s.error_calls > 0]


@router.get(
    "/timeseries",
    response_model=list[TimeseriesPoint],
    summary="Time-bucketed call and error counts",
    description=(
        "Returns one data point per time bucket (default 1-hour buckets) "
        "across the specified look-back window."
    ),
)
async def get_timeseries(
    hours: int = Query(24, ge=1, le=720),
    bucket_minutes: int = Query(60, ge=5, le=1440),
    service: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db_dep),
) -> list[TimeseriesPoint]:
    since = time.time() - hours * 3600
    stmt = select(
        ApiEvent.ts, ApiEvent.status_code, ApiEvent.latency_ms
    ).where(ApiEvent.ts >= since)
    if service:
        stmt = stmt.where(ApiEvent.service == service)
    rows = (await db.execute(stmt)).all()

    bucket_seconds = bucket_minutes * 60
    buckets: dict[int, dict] = defaultdict(lambda: {"calls": 0, "errors": 0, "latencies": []})
    for ts, status_code, latency_ms in rows:
        bucket_key = int(ts // bucket_seconds) * bucket_seconds
        b = buckets[bucket_key]
        b["calls"] += 1
        b["latencies"].append(latency_ms)
        if status_code >= 400:
            b["errors"] += 1

    result: list[TimeseriesPoint] = []
    for bucket_key in sorted(buckets.keys()):
        import datetime as _dt
        b = buckets[bucket_key]
        lats = b["latencies"]
        result.append(
            TimeseriesPoint(
                bucket=_dt.datetime.fromtimestamp(bucket_key, tz=_dt.timezone.utc).isoformat(),
                calls=b["calls"],
                errors=b["errors"],
                avg_latency_ms=round(sum(lats) / len(lats), 2) if lats else 0.0,
            )
        )
    return result
