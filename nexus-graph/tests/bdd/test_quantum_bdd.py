"""
BDD step implementations for quantum_partition.feature.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from pytest_bdd import given, when, then, parsers, scenarios
from starlette.testclient import TestClient

scenarios("features/quantum_partition.feature")

NODES = ["node-1", "node-2", "node-3", "node-4"]
EDGES = [
    {"source": "node-1", "target": "node-2", "weight": 1.5},
    {"source": "node-2", "target": "node-3", "weight": 2.0},
    {"source": "node-3", "target": "node-4", "weight": 1.0},
]


@pytest.fixture
def ctx():
    return {}


@pytest.fixture
def graph_app():
    with patch("app.database.init_db"), patch("app.database.close_db", new_callable=AsyncMock):
        from app.main import create_app
        return create_app()


@given("the graph service is running")
def service_running(graph_app, ctx):
    ctx["app"] = graph_app


@when('I POST nodes and edges to "/v1/graph/quantum/partition"')
def post_partition(ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post(
            "/v1/graph/quantum/partition",
            json={"nodes": NODES, "edges": EDGES},
        )
    ctx["response"] = r
    try:
        ctx["body"] = r.json()
    except Exception:
        ctx["body"] = {}


@when('I POST a single node to "/v1/graph/quantum/partition"')
def post_single_node(ctx):
    with TestClient(ctx["app"], raise_server_exceptions=False) as c:
        r = c.post(
            "/v1/graph/quantum/partition",
            json={"nodes": ["only-node"], "edges": []},
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


@then("the response status is 422 or 400")
def check_status_validation(ctx):
    assert ctx["response"].status_code in (422, 400), (
        f"Expected 422 or 400, got {ctx['response'].status_code}"
    )


@then(parsers.parse('the body contains "{field}"'))
def check_field_present(field, ctx):
    assert field in ctx["body"], f"Field '{field}' missing: {ctx['body']}"


@then(parsers.parse('"{field}" is a boolean in the body'))
def check_bool_field(field, ctx):
    assert field in ctx["body"]
    assert isinstance(ctx["body"][field], bool)
