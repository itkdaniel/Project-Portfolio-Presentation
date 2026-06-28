"""
BDD step implementations for quantum_tune.feature.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pytest_bdd import given, when, then, parsers, scenarios
from starlette.testclient import TestClient

scenarios("features/quantum_tune.feature")

SAMPLE_PAIRS = [
    {"query": "authentication jwt", "relevant_doc_ids": ["doc1", "doc2"]},
    {"query": "docker containers", "relevant_doc_ids": ["doc3"]},
]


@pytest.fixture
def ctx():
    return {}


@pytest.fixture
def bdd_quantum_app():
    from app.routers.quantum import router as quantum_router
    app = FastAPI(title="test")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.include_router(quantum_router)
    return app


@given("the search service quantum endpoint is available")
def service_running(bdd_quantum_app, ctx):
    ctx["app"] = bdd_quantum_app


@when('I POST training pairs to "/v1/search/quantum/tune"')
def post_training_pairs(ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post("/v1/search/quantum/tune", json={"training_pairs": SAMPLE_PAIRS})
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


@when('I POST empty training pairs to "/v1/search/quantum/tune"')
def post_empty_pairs(ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post("/v1/search/quantum/tune", json={"training_pairs": []})
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
