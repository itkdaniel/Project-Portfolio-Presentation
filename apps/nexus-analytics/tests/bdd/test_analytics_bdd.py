"""
BDD step implementations for analytics.feature.
Uses synchronous TestClient (Starlette) to avoid asyncio event-loop conflicts
between pytest-asyncio's setup and pytest-bdd's fixture handling.
"""
from __future__ import annotations

import time

import pytest
from pytest_bdd import given, parsers, scenarios, then, when
from starlette.testclient import TestClient

from app.config import Settings
from app.main import create_app

scenarios("features/analytics.feature")


# ── Shared client fixture ─────────────────────────────────────────────────────

@pytest.fixture()
def context():
    """Mutable dict passed between steps."""
    return {}


@pytest.fixture()
def analytics_client():
    settings = Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        debug=False,
        retention_days=0,
    )
    app = create_app(settings)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ── Background ────────────────────────────────────────────────────────────────

@given("the analytics service is running")
def service_running(analytics_client):
    r = analytics_client.get("/health")
    assert r.status_code == 200


# ── Step: POST a well-formed event ────────────────────────────────────────────

@when(parsers.parse('I POST an event for service "{service}" with status {status:d} and latency {latency:d}ms'))
def post_event(analytics_client, context, service, status, latency):
    context["response"] = analytics_client.post("/v1/analytics/events", json={
        "service": service,
        "method": "POST",
        "endpoint": "/v1/test",
        "status_code": status,
        "latency_ms": float(latency),
    })


# ── Step: POST an event with invalid method ───────────────────────────────────

@when(parsers.parse('I POST an event with HTTP method "{method}"'))
def post_event_bad_method(analytics_client, context, method):
    context["response"] = analytics_client.post("/v1/analytics/events", json={
        "service": "test-svc",
        "method": method,
        "endpoint": "/v1/foo",
        "status_code": 200,
        "latency_ms": 1.0,
    })


# ── Step: Seed N events for a service ────────────────────────────────────────

@given(parsers.parse('I have recorded 3 events for "{service}" with statuses 200, 200, 500'))
def seed_three_events(analytics_client, service):
    for sc in [200, 200, 500]:
        analytics_client.post("/v1/analytics/events", json={
            "service": service, "method": "GET",
            "endpoint": "/v1/foo", "status_code": sc, "latency_ms": 5.0,
        })


@given(parsers.parse('I have recorded 5 events for endpoint "{ep1}" and 2 for "{ep2}"'))
def seed_endpoint_events(analytics_client, ep1, ep2):
    for _ in range(5):
        analytics_client.post("/v1/analytics/events", json={
            "service": "nexus-test", "method": "POST",
            "endpoint": ep1, "status_code": 201, "latency_ms": 10.0,
        })
    for _ in range(2):
        analytics_client.post("/v1/analytics/events", json={
            "service": "nexus-test", "method": "GET",
            "endpoint": ep2, "status_code": 200, "latency_ms": 2.0,
        })


@given("I have recorded 1 success for \"healthy-svc\" and 1 error for \"broken-svc\"")
def seed_healthy_and_error(analytics_client):
    analytics_client.post("/v1/analytics/events", json={
        "service": "healthy-svc", "method": "GET", "endpoint": "/v1/x",
        "status_code": 200, "latency_ms": 1.0,
    })
    analytics_client.post("/v1/analytics/events", json={
        "service": "broken-svc", "method": "POST", "endpoint": "/v1/y",
        "status_code": 500, "latency_ms": 999.0, "error": "RuntimeError",
    })


@given("I have recorded 3 events spread across the last 3 hours")
def seed_timeseries_events(analytics_client):
    now = time.time()
    for i in range(3):
        analytics_client.post("/v1/analytics/events", json={
            "service": "nexus-ts", "method": "GET", "endpoint": "/v1/ts",
            "status_code": 200, "latency_ms": 5.0, "ts": now - i * 3600,
        })


# ── GET steps ─────────────────────────────────────────────────────────────────

@when("I GET /v1/analytics/summary")
def get_summary(analytics_client, context):
    context["response"] = analytics_client.get("/v1/analytics/summary")


@when(parsers.parse("I GET /v1/analytics/top-endpoints with limit {limit:d}"))
def get_top(analytics_client, context, limit):
    context["response"] = analytics_client.get(f"/v1/analytics/top-endpoints?limit={limit}")


@when("I GET /v1/analytics/errors")
def get_errors(analytics_client, context):
    context["response"] = analytics_client.get("/v1/analytics/errors")


@when(parsers.parse("I GET /v1/analytics/timeseries with bucket_minutes {bm:d}"))
def get_timeseries(analytics_client, context, bm):
    context["response"] = analytics_client.get(f"/v1/analytics/timeseries?bucket_minutes={bm}&hours=4")


# ── Then steps ────────────────────────────────────────────────────────────────

@then(parsers.parse("the response status code is {code:d}"))
def check_status(context, code):
    assert context["response"].status_code == code


@then(parsers.parse('the response body contains service "{service}"'))
def check_service_field(context, service):
    assert context["response"].json()["service"] == service


@then(parsers.parse("the response body contains latency {latency:f}"))
def check_latency_field(context, latency):
    assert context["response"].json()["latency_ms"] == latency


@then(parsers.parse('the response body contains "{key}"'))
def check_key_present(context, key):
    body = context["response"].json()
    assert key in body


@then(parsers.parse('the summary for "{service}" has total_calls {total:d}'))
def check_summary_calls(context, service, total):
    summaries = context["response"].json()
    match = next((s for s in summaries if s["service"] == service), None)
    assert match is not None, f"Service {service!r} not found in summary"
    assert match["total_calls"] == total


@then(parsers.parse('the first endpoint is "{endpoint}"'))
def check_top_endpoint(context, endpoint):
    endpoints = context["response"].json()
    assert len(endpoints) >= 1
    assert endpoints[0]["endpoint"] == endpoint


@then(parsers.parse('"{service}" appears in the results'))
def check_appears(context, service):
    names = [s["service"] for s in context["response"].json()]
    assert service in names


@then(parsers.parse('"{service}" does not appear in the results'))
def check_absent(context, service):
    names = [s["service"] for s in context["response"].json()]
    assert service not in names


@then(parsers.parse("I receive at least {n:d} timeseries bucket"))
def check_buckets(context, n):
    assert len(context["response"].json()) >= n


@then(parsers.parse("the total calls across all buckets is {total:d}"))
def check_total_calls(context, total):
    actual = sum(b["calls"] for b in context["response"].json())
    assert actual == total
