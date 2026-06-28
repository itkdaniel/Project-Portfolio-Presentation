"""
BDD step implementations for quantum_optimize.feature.
"""
from __future__ import annotations

import pytest
from pytest_bdd import given, when, then, parsers, scenarios
from starlette.testclient import TestClient

scenarios("features/quantum_optimize.feature")

ASSETS = ["BTC", "ETH", "SOL"]
COV = [
    [0.04, 0.02, 0.01],
    [0.02, 0.03, 0.015],
    [0.01, 0.015, 0.02],
]


@pytest.fixture
def ctx():
    return {}


@pytest.fixture
def analytics_app():
    from app.main import create_app
    return create_app()


@given("the crypto-analytics quantum endpoint is available")
def service_running(analytics_app, ctx):
    ctx["app"] = analytics_app


@when("I POST a portfolio optimization request")
def post_optimize(ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post(
            "/v1/analytics/quantum/optimize",
            json={"assets": ASSETS, "cov_matrix": COV, "risk_tolerance": 0.5},
        )
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


@when("I POST a single-asset optimization request")
def post_single_asset(ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post(
            "/v1/analytics/quantum/optimize",
            json={"assets": ["BTC"], "cov_matrix": [[0.04]], "risk_tolerance": 0.5},
        )
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


@then(parsers.parse("the response status is {code:d}"))
def check_status(code, ctx):
    assert ctx["response"].status_code == code, (
        f"Expected {code}, got {ctx['response'].status_code}: {ctx['body']}"
    )


@then(parsers.parse('the body contains "{field}"'))
def check_field_present(field, ctx):
    assert field in ctx["body"], f"Field '{field}' missing: {ctx['body']}"


@then(parsers.parse('"{field}" is a boolean in the body'))
def check_bool_field(field, ctx):
    assert field in ctx["body"]
    assert isinstance(ctx["body"][field], bool)
