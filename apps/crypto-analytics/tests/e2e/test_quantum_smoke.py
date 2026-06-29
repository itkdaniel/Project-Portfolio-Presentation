"""
E2E smoke tests for POST /v1/analytics/quantum/optimize.

Boots the crypto-analytics FastAPI app via ASGITransport — no real
server needed. These tests exist to catch import-chain breakage
(e.g. nexus_shared not resolvable) and routing regressions as the
sub-app evolves.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


QUANTUM_PATH = "/v1/analytics/quantum/optimize"

ASSETS_3 = ["BTC", "ETH", "SOL"]
COV_3x3 = [
    [0.04, 0.02, 0.01],
    [0.02, 0.03, 0.015],
    [0.01, 0.015, 0.02],
]

ASSETS_2 = ["BTC", "ETH"]
COV_2x2 = [[0.04, 0.01], [0.01, 0.02]]

SAMPLE_PAYLOAD = {
    "assets": ASSETS_3,
    "cov_matrix": COV_3x3,
    "risk_tolerance": 0.5,
    "num_steps": 50,
}


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


class TestQuantumSmokeCryptoAnalytics:
    """Smoke: endpoint is reachable and returns the correct envelope shape."""

    async def test_quantum_optimize_reachable(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.status_code == 200, r.text

    async def test_response_has_all_required_fields(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        required = {
            "quantum_weights",
            "classical_weights",
            "quantum_sharpe",
            "classical_sharpe",
            "fallback_used",
        }
        assert required.issubset(body.keys()), (
            f"Missing fields: {required - body.keys()}"
        )

    async def test_quantum_weights_keys_match_assets(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        assert set(body["quantum_weights"].keys()) == set(ASSETS_3)
        assert set(body["classical_weights"].keys()) == set(ASSETS_3)

    async def test_quantum_weights_sum_to_one(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        q_sum = sum(body["quantum_weights"].values())
        c_sum = sum(body["classical_weights"].values())
        assert abs(q_sum - 1.0) < 0.01, f"quantum_weights sum {q_sum} ≠ 1.0"
        assert abs(c_sum - 1.0) < 0.01, f"classical_weights sum {c_sum} ≠ 1.0"

    async def test_all_weights_non_negative(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        for k, v in body["quantum_weights"].items():
            assert v >= 0.0, f"Negative quantum weight for {k}: {v}"
        for k, v in body["classical_weights"].items():
            assert v >= 0.0, f"Negative classical weight for {k}: {v}"

    async def test_sharpe_ratios_are_floats(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        assert isinstance(body["quantum_sharpe"], float)
        assert isinstance(body["classical_sharpe"], float)

    async def test_fallback_used_is_bool(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert isinstance(r.json()["fallback_used"], bool)

    async def test_fallback_true_when_no_azure_env(self, client):
        import os
        os.environ.pop("AZURE_QUANTUM_WORKSPACE_ID", None)
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.json()["fallback_used"] is True

    async def test_two_asset_portfolio(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={
                "assets": ASSETS_2,
                "cov_matrix": COV_2x2,
                "risk_tolerance": 0.3,
                "num_steps": 50,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert set(body["quantum_weights"].keys()) == set(ASSETS_2)

    async def test_single_asset_rejected(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={"assets": ["BTC"], "cov_matrix": [[0.04]], "risk_tolerance": 0.5},
        )
        assert r.status_code == 422

    async def test_mismatched_matrix_rejected(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={
                "assets": ASSETS_3,
                "cov_matrix": COV_2x2,
                "risk_tolerance": 0.5,
            },
        )
        assert r.status_code == 422

    async def test_risk_tolerance_zero(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={**SAMPLE_PAYLOAD, "risk_tolerance": 0.0, "num_steps": 50},
        )
        assert r.status_code == 200

    async def test_risk_tolerance_one(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={**SAMPLE_PAYLOAD, "risk_tolerance": 1.0, "num_steps": 50},
        )
        assert r.status_code == 200

    async def test_risk_tolerance_out_of_range_rejected(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={**SAMPLE_PAYLOAD, "risk_tolerance": 1.5},
        )
        assert r.status_code == 422
