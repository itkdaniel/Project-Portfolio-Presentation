"""
Unit tests for POST /v1/analytics/events — event ingestion endpoint.
42 tests total across unit, BDD, and regression modules.
"""
from __future__ import annotations

import time

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.database import Base, configure_engine
from app.main import create_app
from app.models import ApiEvent


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def test_settings():
    return Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        debug=False,
        retention_days=0,
    )


@pytest.fixture()
async def client(test_settings):
    """Spin up an in-memory app with its own SQLite DB for each test."""
    app = create_app(test_settings)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


# ── /health ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_returns_healthy(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "healthy"
    assert body["service"] == "nexus-analytics"
    assert "uptime" in body


@pytest.mark.asyncio
async def test_info_endpoint(client):
    r = await client.get("/info")
    assert r.status_code == 200
    body = r.json()
    assert body["port"] == 8300
    assert len(body["endpoints"]) >= 5


# ── POST /v1/analytics/events ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_event_success(client):
    payload = {
        "service": "nexus-quantum",
        "method": "POST",
        "endpoint": "/v1/quantum/jobs",
        "status_code": 201,
        "latency_ms": 42.5,
    }
    r = await client.post("/v1/analytics/events", json=payload)
    assert r.status_code == 201
    body = r.json()
    assert body["id"] >= 1
    assert body["service"] == "nexus-quantum"
    assert body["latency_ms"] == 42.5
    assert body["error"] is None
    # ts should be close to now
    assert abs(body["ts"] - time.time()) < 5


@pytest.mark.asyncio
async def test_create_event_with_explicit_ts(client):
    explicit_ts = 1_700_000_000.0
    r = await client.post("/v1/analytics/events", json={
        "service": "nexus-search",
        "method": "GET",
        "endpoint": "/v1/search",
        "status_code": 200,
        "latency_ms": 12.1,
        "ts": explicit_ts,
    })
    assert r.status_code == 201
    assert r.json()["ts"] == explicit_ts


@pytest.mark.asyncio
async def test_create_event_with_error(client):
    r = await client.post("/v1/analytics/events", json={
        "service": "nexus-ai",
        "method": "POST",
        "endpoint": "/v1/ai/embed",
        "status_code": 500,
        "latency_ms": 1234.0,
        "error": "RuntimeError",
    })
    assert r.status_code == 201
    assert r.json()["error"] == "RuntimeError"


@pytest.mark.asyncio
async def test_create_event_missing_required_fields(client):
    r = await client.post("/v1/analytics/events", json={"service": "x"})
    assert r.status_code == 422
    body = r.json()
    assert "error" in body
    assert body["code"] == 422


@pytest.mark.asyncio
async def test_create_event_invalid_method(client):
    r = await client.post("/v1/analytics/events", json={
        "service": "nexus-booking",
        "method": "INVALID_VERB_TOO_LONG",
        "endpoint": "/v1/bookings",
        "status_code": 200,
        "latency_ms": 10.0,
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_event_invalid_status_code_low(client):
    r = await client.post("/v1/analytics/events", json={
        "service": "nexus-tax",
        "method": "GET",
        "endpoint": "/v1/rates",
        "status_code": 99,
        "latency_ms": 5.0,
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_event_invalid_status_code_high(client):
    r = await client.post("/v1/analytics/events", json={
        "service": "nexus-tax",
        "method": "GET",
        "endpoint": "/v1/rates",
        "status_code": 600,
        "latency_ms": 5.0,
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_event_negative_latency(client):
    r = await client.post("/v1/analytics/events", json={
        "service": "nexus-tax",
        "method": "GET",
        "endpoint": "/v1/rates",
        "status_code": 200,
        "latency_ms": -1.0,
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_multiple_events_unique_ids(client):
    ids = []
    for i in range(5):
        r = await client.post("/v1/analytics/events", json={
            "service": "nexus-booking",
            "method": "POST",
            "endpoint": "/v1/bookings",
            "status_code": 201,
            "latency_ms": float(10 + i),
        })
        assert r.status_code == 201
        ids.append(r.json()["id"])
    assert len(set(ids)) == 5, "All event IDs should be unique"


# ── GET /v1/analytics/summary ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_summary_empty(client):
    r = await client.get("/v1/analytics/summary")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_summary_single_service(client):
    for status in [200, 200, 500]:
        await client.post("/v1/analytics/events", json={
            "service": "nexus-booking",
            "method": "GET",
            "endpoint": "/v1/bookings",
            "status_code": status,
            "latency_ms": 10.0,
        })
    r = await client.get("/v1/analytics/summary")
    assert r.status_code == 200
    summary = r.json()
    assert len(summary) == 1
    s = summary[0]
    assert s["service"] == "nexus-booking"
    assert s["total_calls"] == 3
    assert s["success_calls"] == 2
    assert s["error_calls"] == 1
    assert abs(s["success_rate"] - 0.6667) < 0.001


@pytest.mark.asyncio
async def test_summary_multiple_services(client):
    for svc in ["nexus-ai", "nexus-search", "nexus-tax"]:
        await client.post("/v1/analytics/events", json={
            "service": svc,
            "method": "GET",
            "endpoint": "/v1/foo",
            "status_code": 200,
            "latency_ms": 5.0,
        })
    r = await client.get("/v1/analytics/summary")
    names = [s["service"] for s in r.json()]
    assert "nexus-ai" in names
    assert "nexus-search" in names
    assert "nexus-tax" in names


@pytest.mark.asyncio
async def test_summary_hours_filter_excludes_old_events(client):
    old_ts = time.time() - 48 * 3600  # 48 hours ago
    await client.post("/v1/analytics/events", json={
        "service": "old-service",
        "method": "GET",
        "endpoint": "/v1/old",
        "status_code": 200,
        "latency_ms": 1.0,
        "ts": old_ts,
    })
    r = await client.get("/v1/analytics/summary?hours=1")
    names = [s["service"] for s in r.json()]
    assert "old-service" not in names


# ── GET /v1/analytics/top-endpoints ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_top_endpoints_empty(client):
    r = await client.get("/v1/analytics/top-endpoints")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_top_endpoints_ordering(client):
    # POST /v1/bookings 5 times, GET /health 2 times
    for _ in range(5):
        await client.post("/v1/analytics/events", json={
            "service": "nexus-booking", "method": "POST",
            "endpoint": "/v1/bookings", "status_code": 201, "latency_ms": 10.0,
        })
    for _ in range(2):
        await client.post("/v1/analytics/events", json={
            "service": "nexus-booking", "method": "GET",
            "endpoint": "/health", "status_code": 200, "latency_ms": 2.0,
        })
    r = await client.get("/v1/analytics/top-endpoints?limit=2")
    endpoints = r.json()
    assert endpoints[0]["endpoint"] == "/v1/bookings"
    assert endpoints[0]["total_calls"] == 5


@pytest.mark.asyncio
async def test_top_endpoints_service_filter(client):
    for svc in ["nexus-ai", "nexus-search"]:
        await client.post("/v1/analytics/events", json={
            "service": svc, "method": "GET",
            "endpoint": "/v1/foo", "status_code": 200, "latency_ms": 5.0,
        })
    r = await client.get("/v1/analytics/top-endpoints?service=nexus-ai")
    for ep in r.json():
        assert ep["service"] == "nexus-ai"


# ── GET /v1/analytics/errors ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_errors_empty(client):
    r = await client.get("/v1/analytics/errors")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_errors_filters_healthy_services(client):
    await client.post("/v1/analytics/events", json={
        "service": "good-svc", "method": "GET",
        "endpoint": "/v1/health", "status_code": 200, "latency_ms": 1.0,
    })
    await client.post("/v1/analytics/events", json={
        "service": "bad-svc", "method": "POST",
        "endpoint": "/v1/foo", "status_code": 500, "latency_ms": 999.0,
        "error": "RuntimeError",
    })
    r = await client.get("/v1/analytics/errors")
    names = [s["service"] for s in r.json()]
    assert "good-svc" not in names
    assert "bad-svc" in names


# ── GET /v1/analytics/timeseries ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_timeseries_empty(client):
    r = await client.get("/v1/analytics/timeseries")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_timeseries_buckets(client):
    now = time.time()
    for i in range(3):
        await client.post("/v1/analytics/events", json={
            "service": "nexus-quantum", "method": "POST",
            "endpoint": "/v1/quantum/jobs", "status_code": 201,
            "latency_ms": 50.0, "ts": now - i * 3600,
        })
    r = await client.get("/v1/analytics/timeseries?hours=4&bucket_minutes=60")
    assert r.status_code == 200
    buckets = r.json()
    assert len(buckets) >= 1
    total = sum(b["calls"] for b in buckets)
    assert total == 3


@pytest.mark.asyncio
async def test_timeseries_service_filter(client):
    now = time.time()
    for svc in ["nexus-ai", "nexus-search"]:
        await client.post("/v1/analytics/events", json={
            "service": svc, "method": "GET", "endpoint": "/v1/foo",
            "status_code": 200, "latency_ms": 5.0, "ts": now,
        })
    r = await client.get("/v1/analytics/timeseries?service=nexus-ai")
    total = sum(b["calls"] for b in r.json())
    assert total == 1
