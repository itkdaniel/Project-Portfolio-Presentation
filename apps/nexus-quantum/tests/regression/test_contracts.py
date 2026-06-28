"""
Regression / contract tests — pin the response shape of each endpoint.

These tests verify that the JSON response structure remains stable across
refactors. They are not testing business logic — only that the response
envelope fields are present and correctly typed.
"""
from __future__ import annotations

import pytest


@pytest.mark.regression
async def test_health_contract(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["status"], str)
    assert isinstance(data["service"], str)
    assert isinstance(data["version"], str)
    assert isinstance(data["uptime"], float)
    assert isinstance(data["azure_connected"], bool)


@pytest.mark.regression
async def test_info_contract(client):
    resp = await client.get("/info")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["name"], str)
    assert isinstance(data["version"], str)
    assert isinstance(data["port"], int)
    assert isinstance(data["description"], str)
    assert isinstance(data["endpoints"], list)
    for ep in data["endpoints"]:
        assert "method" in ep
        assert "path" in ep
        assert "auth" in ep
        assert "description" in ep


@pytest.mark.regression
async def test_submit_job_contract(client):
    resp = await client.post(
        "/v1/quantum/jobs",
        json={"job_type": "circuit_simulation", "input_payload": {"circuit": "", "shots": 64}},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["id"], str)
    assert isinstance(data["job_type"], str)
    assert isinstance(data["status"], str)
    assert isinstance(data["input_payload"], dict)
    assert isinstance(data["submitted_at"], str)
    # result_payload and completed_at may be null or present
    assert "result_payload" in data
    assert "error_message" in data
    assert "completed_at" in data


@pytest.mark.regression
async def test_list_jobs_contract(client):
    resp = await client.get("/v1/quantum/jobs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.regression
async def test_simulate_contract(client):
    resp = await client.post(
        "/v1/quantum/simulate",
        json={"circuit": "OPENQASM 3.0;", "backend": "toy_statevector", "shots": 64},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["backend"], str)
    assert isinstance(data["shots"], int)
    assert isinstance(data["counts"], dict)
    assert isinstance(data["execution_time_ms"], float)
    assert isinstance(data["num_qubits"], int)
    assert "statevector" in data


@pytest.mark.regression
async def test_backends_contract(client):
    resp = await client.get("/v1/quantum/simulate/backends")
    assert resp.status_code == 200
    backends = resp.json()
    assert isinstance(backends, list)
    for b in backends:
        assert isinstance(b["name"], str)
        assert isinstance(b["description"], str)
        assert isinstance(b["max_qubits"], int)
        assert isinstance(b["simulator"], bool)
        assert isinstance(b["available"], bool)


@pytest.mark.regression
async def test_portfolio_contract(client):
    resp = await client.post(
        "/v1/quantum/optimize/portfolio",
        json={
            "assets": ["A", "B"],
            "expected_returns": [0.1, 0.2],
            "covariance_matrix": [[0.04, 0.01], [0.01, 0.02]],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["weights"], dict)
    assert isinstance(data["expected_return"], float)
    assert isinstance(data["expected_risk"], float)
    assert isinstance(data["sharpe_ratio"], float)
    assert isinstance(data["algorithm_used"], str)
    assert isinstance(data["classical_baseline"], dict)
    assert isinstance(data["execution_time_ms"], float)


@pytest.mark.regression
async def test_route_contract(client):
    resp = await client.post(
        "/v1/quantum/optimize/route",
        json={
            "locations": [
                {"lat": 0.0, "lon": 0.0},
                {"lat": 1.0, "lon": 1.0},
                {"lat": 2.0, "lon": 0.0},
            ]
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["optimal_route"], list)
    assert isinstance(data["total_distance"], float)
    assert isinstance(data["route_per_vehicle"], list)
    assert isinstance(data["algorithm_used"], str)
    assert isinstance(data["classical_baseline"], dict)
    assert isinstance(data["execution_time_ms"], float)


@pytest.mark.regression
async def test_constraint_contract(client):
    resp = await client.post(
        "/v1/quantum/optimize/constraint",
        json={
            "variables": ["x", "y"],
            "qubo_matrix": [[-1.0, 2.0], [2.0, -1.0]],
            "constraints": [],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["solution"], dict)
    assert isinstance(data["energy"], float)
    assert isinstance(data["feasible"], bool)
    assert isinstance(data["algorithm_used"], str)
    assert isinstance(data["classical_baseline"], dict)
    assert isinstance(data["execution_time_ms"], float)


@pytest.mark.regression
async def test_algorithms_contract(client):
    resp = await client.get("/v1/quantum/optimize/algorithms")
    assert resp.status_code == 200
    for a in resp.json():
        assert isinstance(a["name"], str)
        assert isinstance(a["description"], str)
        assert isinstance(a["problem_type"], str)
        assert isinstance(a["requires_azure"], bool)
        assert isinstance(a["parameters"], dict)


@pytest.mark.regression
async def test_create_circuit_contract(client):
    resp = await client.post(
        "/v1/quantum/circuits",
        json={"name": "Test", "qasm": "OPENQASM 3.0;", "num_qubits": 1, "format": "openqasm3"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert isinstance(data["id"], str)
    assert isinstance(data["name"], str)
    assert isinstance(data["qasm"], str)
    assert isinstance(data["num_qubits"], int)
    assert isinstance(data["format"], str)
    assert isinstance(data["created_at"], str)
    assert "description" in data


@pytest.mark.regression
async def test_list_circuits_contract(client):
    resp = await client.get("/v1/quantum/circuits")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.regression
async def test_error_envelope_contract(client):
    """All 404 responses must have error, code, details, request_id."""
    resp = await client.get("/v1/quantum/jobs/no-such-job")
    assert resp.status_code == 404
    data = resp.json()
    assert "error" in data
    assert "code" in data
    assert "details" in data
    assert "request_id" in data


@pytest.mark.regression
async def test_openapi_spec_available(client):
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    spec = resp.json()
    assert "openapi" in spec
    assert "info" in spec
    assert "paths" in spec
