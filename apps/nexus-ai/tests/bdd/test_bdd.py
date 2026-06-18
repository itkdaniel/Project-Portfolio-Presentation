"""
BDD step implementations for classify.feature and embed.feature.
Uses pytest-bdd with mock model — no real PyTorch training needed.

NOTE: pytest-bdd 7.x step functions cannot be async. We use
starlette.testclient.TestClient (sync WSGI-compatible ASGI wrapper)
to make in-process HTTP calls without needing an event loop.
"""
from __future__ import annotations

import json as _json

import pytest
from pytest_bdd import given, when, then, parsers, scenarios
from starlette.testclient import TestClient

scenarios("features/classify.feature")
scenarios("features/embed.feature")


# ── Shared state ──────────────────────────────────────────────────────────────

@pytest.fixture
def ctx():
    return {}


@pytest.fixture
def bdd_app():
    from tests.conftest import _make_test_app
    return _make_test_app()


# ── Given ─────────────────────────────────────────────────────────────────────

@given("the AI service is running with a mock model")
def ai_service_running(bdd_app, ctx):
    ctx["app"] = bdd_app


# ── When ──────────────────────────────────────────────────────────────────────

@when(parsers.parse('I POST to "/v1/ai/classify" with text "{text}"'))
def post_classify(text, ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post("/v1/ai/classify", json={"text": text, "top_k": 3})
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


@when(parsers.parse('I POST to "/v1/ai/classify" with text "{text}" and top_k {k:d}'))
def post_classify_topk(text, k, ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post("/v1/ai/classify", json={"text": text, "top_k": k})
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


@when("I POST to \"/v1/ai/classify\" with text that is 1001 characters long")
def post_classify_too_long(ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post("/v1/ai/classify", json={"text": "x" * 1001, "top_k": 3})
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


@when(parsers.parse('I POST to "/v1/ai/embed" with texts {texts}'))
def post_embed(texts, ctx):
    texts_list = _json.loads(texts)
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post("/v1/ai/embed", json={"texts": texts_list})
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


# ── Then ──────────────────────────────────────────────────────────────────────

@then(parsers.parse("the response status is {status:d}"))
def check_status(status, ctx):
    assert ctx["response"].status_code == status, (
        f"Expected {status}, got {ctx['response'].status_code}. Body: {ctx.get('body')}"
    )


@then(parsers.parse('the response contains "{key}"'))
def check_key(key, ctx):
    assert key in ctx["body"], f"Key '{key}' missing from {ctx['body']}"


@then(parsers.parse('"{key}" has {n:d} items'))
def check_list_length(key, n, ctx):
    items = ctx["body"].get(key, [])
    assert len(items) == n, f"Expected {n} items in '{key}', got {len(items)}: {items}"


@then(parsers.parse('"{key}" has {n:d} rows'))
def check_rows(key, n, ctx):
    rows = ctx["body"].get(key, [])
    assert len(rows) == n, f"Expected {n} rows in '{key}', got {len(rows)}"


@then("each prediction has \"label\" and \"score\"")
def check_prediction_fields(ctx):
    for pred in ctx["body"].get("predictions", []):
        assert "label" in pred
        assert "score" in pred


@then(parsers.parse('"{key}" is false'))
def check_false(key, ctx):
    assert ctx["body"].get(key) is False, f"Expected '{key}' to be false, got {ctx['body'].get(key)}"


@then(parsers.parse('"{key}" equals {value:d}'))
def check_equals(key, value, ctx):
    assert ctx["body"].get(key) == value, f"Expected '{key}'={value}, got {ctx['body'].get(key)}"


@then("each embedding is a list of floats")
def check_embedding_floats(ctx):
    for emb in ctx["body"].get("embeddings", []):
        assert isinstance(emb, list)
        for v in emb:
            assert isinstance(v, (int, float))


@then("prediction scores sum is approximately 1.0")
def check_scores_sum(ctx):
    preds  = ctx["body"].get("predictions", [])
    total  = sum(p["score"] for p in preds)
    # top_k subset of a softmax distribution; tolerance allows partial sums
    assert 0.0 < total <= 1.001, f"Scores {total} not a valid softmax partial sum"
