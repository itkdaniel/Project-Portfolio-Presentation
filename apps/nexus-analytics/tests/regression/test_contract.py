"""
Regression / contract-stability tests for nexus-analytics.

These tests assert that the public API shape (field names, types, HTTP codes)
does NOT regress as the service evolves.  They are intentionally strict —
any change to the response schema should require an explicit update here.
"""
from __future__ import annotations

import time

import pytest
from starlette.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture(scope="module")
def client():
    settings = Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        debug=False,
        retention_days=0,
    )
    app = create_app(settings)
    with TestClient(app) as c:
        # Seed a handful of events for summary/timeseries contract tests.
        now = time.time()
        for i, (svc, sc) in enumerate([
            ("nexus-quantum", 201),
            ("nexus-quantum", 500),
            ("nexus-search",  200),
        ]):
            c.post("/v1/analytics/events", json={
                "service": svc, "method": "GET",
                "endpoint": "/v1/test", "status_code": sc,
                "latency_ms": 10.0 * (i + 1), "ts": now - i * 10,
            })
        yield c


def test_event_response_shape(client):
    """POST /v1/analytics/events must return these exact fields."""
    r = client.post("/v1/analytics/events", json={
        "service": "reg-svc", "method": "POST",
        "endpoint": "/v1/reg", "status_code": 200, "latency_ms": 1.0,
    })
    assert r.status_code == 201
    body = r.json()
    required = {"id", "service", "method", "endpoint", "status_code", "latency_ms", "error", "ts"}
    assert required.issubset(body.keys()), f"Missing fields: {required - body.keys()}"


def test_summary_response_shape(client):
    """GET /v1/analytics/summary must return a list of ServiceSummary objects."""
    r = client.get("/v1/analytics/summary")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    if items:
        required = {"service", "total_calls", "success_calls", "error_calls",
                    "success_rate", "avg_latency_ms", "p95_latency_ms"}
        assert required.issubset(items[0].keys())


def test_top_endpoints_response_shape(client):
    """GET /v1/analytics/top-endpoints must return EndpointSummary objects."""
    r = client.get("/v1/analytics/top-endpoints")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    if items:
        required = {"service", "method", "endpoint", "total_calls",
                    "avg_latency_ms", "error_rate"}
        assert required.issubset(items[0].keys())


def test_timeseries_response_shape(client):
    """GET /v1/analytics/timeseries must return TimeseriesPoint objects."""
    r = client.get("/v1/analytics/timeseries")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    if items:
        required = {"bucket", "calls", "errors", "avg_latency_ms"}
        assert required.issubset(items[0].keys())


def test_validation_error_envelope(client):
    """Validation errors must follow the normalised {error, code, details, request_id} shape."""
    r = client.post("/v1/analytics/events", json={"service": "x"})
    assert r.status_code == 422
    body = r.json()
    assert "error" in body
    assert body["code"] == 422
    assert "details" in body
    assert "request_id" in body
