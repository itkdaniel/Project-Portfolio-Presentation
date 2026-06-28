"""
Regression contract tests — pins exact response field names and types for
POST /v1/analytics/quantum/optimize.
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
COV = [
    [0.04, 0.02, 0.01],
    [0.02, 0.03, 0.015],
    [0.01, 0.015, 0.02],
]

REQUIRED_FIELDS = {
    "quantum_weights": dict,
    "classical_weights": dict,
    "quantum_sharpe": float,
    "classical_sharpe": float,
    "fallback_used": bool,
}


@pytest.mark.asyncio
async def test_field_names_contract(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV},
    )
    assert resp.status_code == 200
    body = resp.json()
    for field in REQUIRED_FIELDS:
        assert field in body, f"Contract violation: '{field}' missing"


@pytest.mark.asyncio
async def test_field_types_contract(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV},
    )
    body = resp.json()
    for field, t in REQUIRED_FIELDS.items():
        assert isinstance(body[field], t), (
            f"Contract violation: '{field}' expected {t.__name__}, got {type(body[field]).__name__}"
        )


@pytest.mark.asyncio
async def test_weight_keys_are_asset_symbols_contract(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV},
    )
    body = resp.json()
    assert set(body["quantum_weights"].keys()) == set(ASSETS)
    assert set(body["classical_weights"].keys()) == set(ASSETS)


@pytest.mark.asyncio
async def test_weight_values_are_floats_contract(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV},
    )
    body = resp.json()
    for sym, w in body["quantum_weights"].items():
        assert isinstance(w, float), f"quantum_weights[{sym}] must be float"
    for sym, w in body["classical_weights"].items():
        assert isinstance(w, float), f"classical_weights[{sym}] must be float"


@pytest.mark.asyncio
async def test_sharpe_ratios_are_floats_contract(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV},
    )
    body = resp.json()
    assert isinstance(body["quantum_sharpe"], float)
    assert isinstance(body["classical_sharpe"], float)


@pytest.mark.asyncio
async def test_no_error_on_success_contract(client):
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ASSETS, "cov_matrix": COV},
    )
    body = resp.json()
    assert body.get("error") is None


@pytest.mark.asyncio
async def test_error_response_includes_fallback_used_on_validation_contract(client):
    """
    Non-200 responses from the quantum endpoint must include fallback_used.
    Trigger a validation error by sending a single-asset portfolio (minimum 2 required).
    """
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ["BTC"], "cov_matrix": [[0.04]]},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert "error" in body, "error field must be present on non-200 responses"
    assert "fallback_used" in body, "fallback_used must be present on non-200 responses"
    assert isinstance(body["fallback_used"], bool)


@pytest.mark.asyncio
async def test_error_response_includes_fallback_used_on_matrix_mismatch_contract(client):
    """
    Non-200 responses from the quantum endpoint must include fallback_used.
    Trigger a validation error by sending mismatched assets/matrix dimensions.
    """
    resp = await client.post(
        "/v1/analytics/quantum/optimize",
        json={"assets": ["BTC", "ETH"], "cov_matrix": [[0.04, 0.02, 0.0]]},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert "error" in body
    assert "fallback_used" in body
    assert isinstance(body["fallback_used"], bool)
