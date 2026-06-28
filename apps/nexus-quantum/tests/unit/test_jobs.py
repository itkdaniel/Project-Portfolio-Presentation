"""
Unit tests for /v1/quantum/jobs endpoints.

Jobs now return status="pending" immediately; the background task transitions
them to completed/failed asynchronously.  Tests that need the final result use
the wait_for_job() polling helper from conftest.
"""
from __future__ import annotations

import pytest

from tests.conftest import wait_for_job

TERMINAL = {"completed", "failed", "cancelled"}


@pytest.mark.unit
async def test_submit_circuit_simulation_job(client):
    resp = await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "circuit_simulation",
            "input_payload": {
                "circuit": "OPENQASM 3.0; qubit[2] q; h q[0]; cx q[0], q[1];",
                "shots": 512,
            },
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["job_type"] == "circuit_simulation"
    assert data["status"] in {"pending", "running", "completed", "failed"}
    assert "id" in data
    assert "submitted_at" in data

    # Poll until done and verify result
    final = await wait_for_job(client, data["id"])
    assert final["status"] in TERMINAL
    if final["status"] == "completed":
        assert final["result_payload"] is not None
        assert "counts" in final["result_payload"]


@pytest.mark.unit
async def test_submit_portfolio_optimization_job(client):
    resp = await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "portfolio_optimization",
            "input_payload": {
                "assets": ["BTC", "ETH"],
                "expected_returns": [0.12, 0.08],
                "covariance_matrix": [[0.04, 0.01], [0.01, 0.02]],
                "risk_tolerance": 0.5,
                "algorithm": "qaoa",
            },
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["job_type"] == "portfolio_optimization"
    assert data["status"] in {"pending", "running", "completed", "failed"}

    final = await wait_for_job(client, data["id"])
    assert final["status"] in TERMINAL


@pytest.mark.unit
async def test_submit_route_optimization_job(client):
    resp = await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "route_optimization",
            "input_payload": {
                "locations": [
                    {"lat": 40.7128, "lon": -74.0060},
                    {"lat": 34.0522, "lon": -118.2437},
                    {"lat": 41.8781, "lon": -87.6298},
                ],
                "algorithm": "quantum_annealing",
            },
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] in {"pending", "running", "completed", "failed"}

    final = await wait_for_job(client, data["id"])
    assert final["status"] in TERMINAL
    if final["status"] == "completed":
        assert "optimal_route" in final["result_payload"]


@pytest.mark.unit
async def test_submit_constraint_qubo_job(client):
    resp = await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "constraint_qubo",
            "input_payload": {
                "variables": ["x0", "x1", "x2"],
                "qubo_matrix": [[-1, 2, 0], [2, -1, 2], [0, 2, -1]],
                "constraints": [],
                "num_reads": 50,
            },
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] in {"pending", "running", "completed", "failed"}

    final = await wait_for_job(client, data["id"])
    assert final["status"] in TERMINAL


@pytest.mark.unit
async def test_submit_vqe_job(client):
    resp = await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "vqe",
            "input_payload": {"hamiltonian": "H2", "num_layers": 3},
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["job_type"] == "vqe"
    assert data["status"] in {"pending", "running", "completed", "failed"}

    final = await wait_for_job(client, data["id"])
    assert final["status"] in TERMINAL


@pytest.mark.unit
async def test_submit_invalid_job_type(client):
    resp = await client.post(
        "/v1/quantum/jobs",
        json={"job_type": "banana_optimization", "input_payload": {}},
    )
    assert resp.status_code == 400
    data = resp.json()
    assert "error" in data


@pytest.mark.unit
async def test_list_jobs_empty(client):
    resp = await client.get("/v1/quantum/jobs")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.unit
async def test_list_jobs_after_submit(client):
    await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "circuit_simulation",
            "input_payload": {"circuit": "", "shots": 64},
        },
    )
    resp = await client.get("/v1/quantum/jobs")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.unit
async def test_get_job_by_id(client):
    create = await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "circuit_simulation",
            "input_payload": {"circuit": "", "shots": 64},
        },
    )
    job_id = create.json()["id"]
    resp = await client.get(f"/v1/quantum/jobs/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id


@pytest.mark.unit
async def test_get_job_not_found(client):
    resp = await client.get("/v1/quantum/jobs/nonexistent-id")
    assert resp.status_code == 404
    assert "error" in resp.json()


@pytest.mark.unit
async def test_cancel_pending_job(client):
    """Cancel a job while it is still pending (before background task runs)."""
    create = await client.post(
        "/v1/quantum/jobs",
        json={
            "job_type": "circuit_simulation",
            "input_payload": {"circuit": "", "shots": 64},
        },
    )
    job_id = create.json()["id"]
    # The job is pending right after submit — cancel it immediately
    resp = await client.delete(f"/v1/quantum/jobs/{job_id}")
    assert resp.status_code == 204


@pytest.mark.unit
async def test_cancel_nonexistent_job(client):
    resp = await client.delete("/v1/quantum/jobs/no-such-job")
    assert resp.status_code == 404
