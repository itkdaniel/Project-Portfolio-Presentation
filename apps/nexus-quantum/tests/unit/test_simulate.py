"""
Unit tests for /v1/quantum/simulate endpoints.
"""
from __future__ import annotations

import pytest


@pytest.mark.unit
async def test_simulate_basic_circuit(client):
    resp = await client.post(
        "/v1/quantum/simulate",
        json={
            "circuit": "OPENQASM 3.0; qubit[2] q; h q[0]; cx q[0], q[1];",
            "backend": "toy_statevector",
            "shots": 1024,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "counts" in data
    assert "backend" in data
    assert data["backend"] == "toy_statevector"
    assert "execution_time_ms" in data
    assert "num_qubits" in data
    assert data["shots"] == 1024


@pytest.mark.unit
async def test_simulate_returns_counts(client):
    resp = await client.post(
        "/v1/quantum/simulate",
        json={
            "circuit": "OPENQASM 3.0; qubit[1] q; h q[0];",
            "backend": "toy_statevector",
            "shots": 100,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    total = sum(data["counts"].values())
    assert total == 100


@pytest.mark.unit
async def test_simulate_returns_statevector(client):
    resp = await client.post(
        "/v1/quantum/simulate",
        json={
            "circuit": "OPENQASM 3.0; qubit[2] q; h q[0];",
            "backend": "toy_statevector",
            "shots": 512,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["statevector"] is not None


@pytest.mark.unit
async def test_simulate_validation_error_shots_zero(client):
    resp = await client.post(
        "/v1/quantum/simulate",
        json={"circuit": "OPENQASM 3.0;", "backend": "toy_statevector", "shots": 0},
    )
    assert resp.status_code == 422


@pytest.mark.unit
async def test_simulate_validation_error_shots_too_large(client):
    resp = await client.post(
        "/v1/quantum/simulate",
        json={"circuit": "OPENQASM 3.0;", "backend": "toy_statevector", "shots": 999999},
    )
    assert resp.status_code == 422


@pytest.mark.unit
async def test_list_backends(client):
    resp = await client.get("/v1/quantum/simulate/backends")
    assert resp.status_code == 200
    backends = resp.json()
    assert isinstance(backends, list)
    assert len(backends) >= 1
    names = [b["name"] for b in backends]
    assert "toy_statevector" in names
    for b in backends:
        assert "name" in b
        assert "description" in b
        assert "max_qubits" in b
        assert "simulator" in b
        assert "available" in b


@pytest.mark.unit
async def test_simulate_empty_circuit_falls_back(client):
    """Empty circuit string should fall back to toy sim without error."""
    resp = await client.post(
        "/v1/quantum/simulate",
        json={"circuit": "", "backend": "toy_statevector", "shots": 64},
    )
    assert resp.status_code == 200
    assert "counts" in resp.json()
