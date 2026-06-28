"""
Unit tests for POST /v1/analytics/quantum/optimize.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


ASSETS = ["BTC", "ETH", "SOL"]
COV_3x3 = [
    [0.04, 0.02, 0.01],
    [0.02, 0.03, 0.015],
    [0.01, 0.015, 0.02],
]


# ── Happy path ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quantum_optimize_returns_200(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV_3x3, "risk_tolerance": 0.5},
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_quantum_optimize_response_shape(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV_3x3},
    )
    body = resp.json()
    required = {"quantum_weights", "classical_weights", "quantum_sharpe", "classical_sharpe", "fallback_used"}
    assert required.issubset(body.keys()), f"Missing fields: {required - body.keys()}"


@pytest.mark.asyncio
async def test_quantum_optimize_weights_sum_to_one(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV_3x3},
    )
    body = resp.json()
    q_sum = sum(body["quantum_weights"].values())
    c_sum = sum(body["classical_weights"].values())
    assert abs(q_sum - 1.0) < 0.01, f"quantum_weights sum {q_sum} != 1.0"
    assert abs(c_sum - 1.0) < 0.01, f"classical_weights sum {c_sum} != 1.0"


@pytest.mark.asyncio
async def test_quantum_optimize_all_assets_in_weights(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV_3x3},
    )
    body = resp.json()
    assert set(body["quantum_weights"].keys()) == set(ASSETS)
    assert set(body["classical_weights"].keys()) == set(ASSETS)


@pytest.mark.asyncio
async def test_quantum_optimize_weights_non_negative(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV_3x3},
    )
    body = resp.json()
    for sym, w in body["quantum_weights"].items():
        assert w >= 0.0, f"quantum weight for {sym} is negative: {w}"
    for sym, w in body["classical_weights"].items():
        assert w >= 0.0, f"classical weight for {sym} is negative: {w}"


@pytest.mark.asyncio
async def test_quantum_optimize_fallback_used_bool(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV_3x3},
    )
    body = resp.json()
    assert isinstance(body["fallback_used"], bool)


@pytest.mark.asyncio
async def test_quantum_optimize_risk_tolerance_extremes(client):
    for rt in [0.0, 1.0]:
        resp = await client.post(
            "/v1/analytics/quantum/optimize",
            json={"assets": ASSETS, "cov_matrix": COV_3x3, "risk_tolerance": rt},
        )
        assert resp.status_code == 200


# ── Validation ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quantum_optimize_single_asset_rejected(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ["BTC"], "cov_matrix": [[0.04]], "risk_tolerance": 0.5},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_quantum_optimize_mismatched_matrix_rejected(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={
            "assets": ["BTC", "ETH"],
            "cov_matrix": [[0.04, 0.02, 0.01]],
            "risk_tolerance": 0.5,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_quantum_optimize_invalid_risk_tolerance(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV_3x3, "risk_tolerance": 1.5},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_quantum_optimize_missing_body_rejected(client):
    resp = await client.post("/v1/analytics/quantum/optimize", json={})
    assert resp.status_code == 422
