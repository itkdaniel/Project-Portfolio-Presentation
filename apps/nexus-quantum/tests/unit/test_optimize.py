"""
Unit tests for /v1/quantum/optimize endpoints.
"""
from __future__ import annotations

import pytest


ASSETS = ["BTC", "ETH", "SOL"]
RETURNS = [0.15, 0.10, 0.20]
COV = [
    [0.05, 0.02, 0.03],
    [0.02, 0.03, 0.01],
    [0.03, 0.01, 0.06],
]


@pytest.mark.unit
async def test_portfolio_qaoa(client):
    resp = await client.post(
        "/v1/quantum/optimize/portfolio",
        json={
            "assets": ASSETS,
            "expected_returns": RETURNS,
            "covariance_matrix": COV,
            "risk_tolerance": 0.5,
            "algorithm": "qaoa",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "weights" in data
    assert set(data["weights"].keys()) == set(ASSETS)
    total = sum(data["weights"].values())
    assert abs(total - 1.0) < 0.01
    assert "expected_return" in data
    assert "expected_risk" in data
    assert "sharpe_ratio" in data
    assert "classical_baseline" in data
    assert "execution_time_ms" in data
    assert data["algorithm_used"] == "qaoa"


@pytest.mark.unit
async def test_portfolio_classical_markowitz(client):
    resp = await client.post(
        "/v1/quantum/optimize/portfolio",
        json={
            "assets": ASSETS,
            "expected_returns": RETURNS,
            "covariance_matrix": COV,
            "risk_tolerance": 0.3,
            "algorithm": "classical_markowitz",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["algorithm_used"] == "classical_markowitz"


@pytest.mark.unit
async def test_portfolio_mismatched_returns(client):
    resp = await client.post(
        "/v1/quantum/optimize/portfolio",
        json={
            "assets": ASSETS,
            "expected_returns": [0.10, 0.15],  # wrong length
            "covariance_matrix": COV,
        },
    )
    assert resp.status_code == 400


@pytest.mark.unit
async def test_portfolio_bad_covariance(client):
    resp = await client.post(
        "/v1/quantum/optimize/portfolio",
        json={
            "assets": ASSETS,
            "expected_returns": RETURNS,
            "covariance_matrix": [[0.05, 0.02], [0.02, 0.03]],  # wrong size
        },
    )
    assert resp.status_code == 400


@pytest.mark.unit
async def test_portfolio_min_assets(client):
    resp = await client.post(
        "/v1/quantum/optimize/portfolio",
        json={
            "assets": ["A"],  # too few
            "expected_returns": [0.1],
            "covariance_matrix": [[0.05]],
        },
    )
    assert resp.status_code == 422


@pytest.mark.unit
async def test_route_quantum_annealing(client):
    resp = await client.post(
        "/v1/quantum/optimize/route",
        json={
            "locations": [
                {"lat": 40.7128, "lon": -74.0060},
                {"lat": 34.0522, "lon": -118.2437},
                {"lat": 41.8781, "lon": -87.6298},
                {"lat": 29.7604, "lon": -95.3698},
            ],
            "algorithm": "quantum_annealing",
            "num_vehicles": 1,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "optimal_route" in data
    assert "total_distance" in data
    assert "route_per_vehicle" in data
    assert "classical_baseline" in data
    assert data["algorithm_used"] == "quantum_annealing"


@pytest.mark.unit
async def test_route_nearest_neighbor(client):
    resp = await client.post(
        "/v1/quantum/optimize/route",
        json={
            "locations": [
                {"lat": 0.0, "lon": 0.0},
                {"lat": 1.0, "lon": 0.0},
                {"lat": 1.0, "lon": 1.0},
            ],
            "algorithm": "nearest_neighbor",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["algorithm_used"] == "nearest_neighbor"


@pytest.mark.unit
async def test_route_min_locations(client):
    resp = await client.post(
        "/v1/quantum/optimize/route",
        json={"locations": [{"lat": 0.0, "lon": 0.0}]},  # too few
    )
    assert resp.status_code == 422


@pytest.mark.unit
async def test_constraint_simulated_annealing(client):
    resp = await client.post(
        "/v1/quantum/optimize/constraint",
        json={
            "variables": ["x0", "x1", "x2"],
            "qubo_matrix": [
                [-1.0, 2.0, 0.0],
                [2.0, -1.0, 2.0],
                [0.0, 2.0, -1.0],
            ],
            "constraints": [],
            "algorithm": "simulated_annealing",
            "num_reads": 50,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "solution" in data
    assert set(data["solution"].keys()) == {"x0", "x1", "x2"}
    assert all(v in (0, 1) for v in data["solution"].values())
    assert "energy" in data
    assert "feasible" in data
    assert "classical_baseline" in data
    assert "execution_time_ms" in data


@pytest.mark.unit
async def test_constraint_bad_qubo_shape(client):
    resp = await client.post(
        "/v1/quantum/optimize/constraint",
        json={
            "variables": ["x0", "x1"],
            "qubo_matrix": [[-1.0, 2.0, 0.0], [2.0, -1.0]],  # wrong shape
            "constraints": [],
        },
    )
    assert resp.status_code == 400


@pytest.mark.unit
async def test_list_algorithms(client):
    resp = await client.get("/v1/quantum/optimize/algorithms")
    assert resp.status_code == 200
    algorithms = resp.json()
    assert isinstance(algorithms, list)
    assert len(algorithms) >= 4
    names = [a["name"] for a in algorithms]
    assert "qaoa" in names
    assert "simulated_annealing" in names
    for a in algorithms:
        assert "name" in a
        assert "description" in a
        assert "problem_type" in a
        assert "requires_azure" in a
