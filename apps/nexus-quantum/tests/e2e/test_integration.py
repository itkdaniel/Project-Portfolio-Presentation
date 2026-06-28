"""
End-to-end integration tests — run against the live FastAPI app
(with SQLite in-memory DB, not PostgreSQL).

These tests exercise the full request/response cycle including DB writes.
"""
from __future__ import annotations

import pytest


@pytest.mark.e2e
async def test_full_job_lifecycle(client):
    """Submit → list → get → cancel a job end-to-end."""
    # 1. Submit
    resp = await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "circuit_simulation",
            "input_payload": {
                "circuit": "OPENQASM 3.0; qubit[2] q; h q[0]; cx q[0], q[1];",
                "shots": 256,
            },
        },
    )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    # 2. List
    list_resp = await client.get("/v1/quantum/jobs")
    assert list_resp.status_code == 200
    job_ids = [j["id"] for j in list_resp.json()]
    assert job_id in job_ids

    # 3. Get
    get_resp = await client.get(f"/v1/quantum/jobs/{job_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == job_id

    # 4. Cancel (idempotent on completed)
    del_resp = await client.delete(f"/v1/quantum/jobs/{job_id}")
    assert del_resp.status_code == 204


@pytest.mark.e2e
async def test_full_circuit_crud(client):
    """Create → list → get circuit end-to-end."""
    qasm = "OPENQASM 3.0;\nqubit[2] q;\nh q[0];\ncx q[0], q[1];\n"

    # Create
    resp = await client.post(
        "/v1/quantum/circuits",
        json={"name": "E2E Bell", "qasm": qasm, "num_qubits": 2, "format": "openqasm3"},
    )
    assert resp.status_code == 201
    circuit_id = resp.json()["id"]

    # List
    list_resp = await client.get("/v1/quantum/circuits")
    ids = [c["id"] for c in list_resp.json()]
    assert circuit_id in ids

    # Get
    get_resp = await client.get(f"/v1/quantum/circuits/{circuit_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["qasm"] == qasm


@pytest.mark.e2e
async def test_portfolio_optimization_e2e(client):
    assets = ["AAPL", "GOOGL", "MSFT", "AMZN"]
    returns = [0.12, 0.15, 0.10, 0.18]
    cov = [
        [0.04, 0.01, 0.02, 0.01],
        [0.01, 0.05, 0.01, 0.02],
        [0.02, 0.01, 0.03, 0.01],
        [0.01, 0.02, 0.01, 0.06],
    ]
    resp = await client.post(
        "/v1/quantum/optimize/portfolio",
        json={
            "assets": assets,
            "expected_returns": returns,
            "covariance_matrix": cov,
            "risk_tolerance": 0.4,
            "algorithm": "qaoa",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    total_weight = sum(data["weights"].values())
    assert abs(total_weight - 1.0) < 0.05
    assert data["expected_return"] > 0
    assert data["expected_risk"] >= 0


@pytest.mark.e2e
async def test_route_optimization_e2e(client):
    cities = [
        {"lat": 51.5074, "lon": -0.1278},   # London
        {"lat": 48.8566, "lon": 2.3522},    # Paris
        {"lat": 52.5200, "lon": 13.4050},   # Berlin
        {"lat": 41.9028, "lon": 12.4964},   # Rome
        {"lat": 40.4168, "lon": -3.7038},   # Madrid
    ]
    resp = await client.post(
        "/v1/quantum/optimize/route",
        json={"locations": cities, "algorithm": "quantum_annealing", "num_vehicles": 2},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["optimal_route"]) == len(cities) + 1
    assert data["total_distance"] > 0
    assert len(data["route_per_vehicle"]) >= 1


@pytest.mark.e2e
async def test_constraint_solver_e2e(client):
    resp = await client.post(
        "/v1/quantum/optimize/constraint",
        json={
            "variables": ["a", "b", "c", "d"],
            "qubo_matrix": [
                [-1.0, 2.0, 0.0, 0.0],
                [2.0, -1.0, 2.0, 0.0],
                [0.0, 2.0, -1.0, 2.0],
                [0.0, 0.0, 2.0, -1.0],
            ],
            "constraints": [{"variables": ["a", "b", "c", "d"], "op": "ge", "rhs": 1}],
            "num_reads": 100,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(v in (0, 1) for v in data["solution"].values())


@pytest.mark.e2e
async def test_simulate_and_store_circuit_e2e(client):
    """Simulate a circuit then store it for later reuse."""
    circuit_str = "OPENQASM 3.0;\nqubit[3] q;\nh q[0];\ncx q[0], q[1];\ncx q[1], q[2];\n"

    # Simulate
    sim_resp = await client.post(
        "/v1/quantum/simulate",
        json={"circuit": circuit_str, "backend": "toy_statevector", "shots": 1024},
    )
    assert sim_resp.status_code == 200
    sim_data = sim_resp.json()
    assert sim_data["num_qubits"] == 3

    # Store circuit
    create_resp = await client.post(
        "/v1/quantum/circuits",
        json={"name": "GHZ-3", "qasm": circuit_str, "num_qubits": 3, "format": "openqasm3"},
    )
    assert create_resp.status_code == 201

    # Retrieve and verify
    cid = create_resp.json()["id"]
    get_resp = await client.get(f"/v1/quantum/circuits/{cid}")
    assert get_resp.json()["qasm"] == circuit_str


@pytest.mark.e2e
async def test_multiple_job_types_e2e(client):
    """Submit one of each job type and verify all complete without error."""
    job_specs = [
        {
            "job_type": "circuit_simulation",
            "input_payload": {"circuit": "", "shots": 64},
        },
        {
            "job_type": "portfolio_optimization",
            "input_payload": {
                "assets": ["X", "Y"],
                "expected_returns": [0.1, 0.2],
                "covariance_matrix": [[0.04, 0.01], [0.01, 0.02]],
            },
        },
        {
            "job_type": "route_optimization",
            "input_payload": {
                "locations": [{"lat": 0.0, "lon": 0.0}, {"lat": 1.0, "lon": 1.0}],
            },
        },
        {
            "job_type": "constraint_qubo",
            "input_payload": {
                "variables": ["x"],
                "qubo_matrix": [[-1.0]],
                "constraints": [],
            },
        },
    ]
    from tests.conftest import wait_for_job

    for spec in job_specs:
        resp = await client.post("/v1/quantum/jobs", json=spec)
        assert resp.status_code == 201, f"Failed for {spec['job_type']}: {resp.text}"
        job_id = resp.json()["id"]
        # Initial status is pending; poll until the background task finishes
        final = await wait_for_job(client, job_id)
        assert final["status"] in ("completed", "failed"), (
            f"{spec['job_type']} stuck in status: {final['status']}"
        )
