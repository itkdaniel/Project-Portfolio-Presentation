"""
BDD step implementations for quantum_embed.feature.
Uses pytest-bdd with mock model — no real PyTorch training needed.
"""
from __future__ import annotations

import pytest
from pytest_bdd import given, when, then, parsers, scenarios
from starlette.testclient import TestClient

scenarios("features/quantum_embed.feature")


@pytest.fixture
def ctx():
    return {}


@pytest.fixture
def bdd_app():
    from tests.conftest import _make_test_app
    from app.routers.quantum import router as quantum_router
    app = _make_test_app()
    app.include_router(quantum_router)
    return app


@given("the AI service is running with a mock model")
def ai_service_running(bdd_app, ctx):
    ctx["app"] = bdd_app


@when(parsers.parse('I POST to "/v1/ai/quantum/embed" with texts "{text}" and target_dim {dim:d}'))
def post_quantum_embed(text, dim, ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post("/v1/ai/quantum/embed", json={"texts": [text], "target_dim": dim})
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


@when('I POST to "/v1/ai/quantum/embed" with an empty texts list')
def post_quantum_embed_empty(ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post("/v1/ai/quantum/embed", json={"texts": []})
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
    assert field in ctx["body"], f"Field '{field}' missing from body: {ctx['body']}"


@then(parsers.parse('"{field}" is true or false in the body'))
def check_bool_field(field, ctx):
    assert field in ctx["body"], f"Field '{field}' missing from body"
    assert isinstance(ctx["body"][field], bool), f"'{field}' is not bool: {ctx['body'][field]}"
