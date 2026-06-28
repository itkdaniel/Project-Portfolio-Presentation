"""
Unit tests for /v1/quantum/circuits endpoints.
"""
from __future__ import annotations

import pytest

BELL_QASM = """OPENQASM 3.0;
qubit[2] q;
h q[0];
cx q[0], q[1];
"""


@pytest.mark.unit
async def test_create_circuit(client):
    resp = await client.post(
        "/v1/quantum/circuits",
        json={
            "name": "Bell State",
            "description": "2-qubit Bell state circuit",
            "qasm": BELL_QASM,
            "num_qubits": 2,
            "format": "openqasm3",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Bell State"
    assert data["num_qubits"] == 2
    assert data["format"] == "openqasm3"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.unit
async def test_list_circuits_empty(client):
    resp = await client.get("/v1/quantum/circuits")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.unit
async def test_list_circuits_after_create(client):
    await client.post(
        "/v1/quantum/circuits",
        json={"name": "C1", "qasm": "OPENQASM 3.0;", "num_qubits": 1, "format": "openqasm3"},
    )
    await client.post(
        "/v1/quantum/circuits",
        json={"name": "C2", "qasm": "OPENQASM 3.0;", "num_qubits": 2, "format": "openqasm3"},
    )
    resp = await client.get("/v1/quantum/circuits")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


@pytest.mark.unit
async def test_get_circuit_by_id(client):
    create = await client.post(
        "/v1/quantum/circuits",
        json={"name": "GHZ", "qasm": BELL_QASM, "num_qubits": 3, "format": "openqasm3"},
    )
    circuit_id = create.json()["id"]
    resp = await client.get(f"/v1/quantum/circuits/{circuit_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == circuit_id
    assert resp.json()["name"] == "GHZ"


@pytest.mark.unit
async def test_get_circuit_not_found(client):
    resp = await client.get("/v1/quantum/circuits/nonexistent-id")
    assert resp.status_code == 404
    assert "error" in resp.json()


@pytest.mark.unit
async def test_create_circuit_invalid_format(client):
    resp = await client.post(
        "/v1/quantum/circuits",
        json={"name": "Bad", "qasm": "...", "num_qubits": 1, "format": "not_a_real_format"},
    )
    assert resp.status_code == 400


@pytest.mark.unit
async def test_create_circuit_empty_name(client):
    resp = await client.post(
        "/v1/quantum/circuits",
        json={"name": "", "qasm": "OPENQASM 3.0;", "num_qubits": 1, "format": "openqasm3"},
    )
    assert resp.status_code == 422


@pytest.mark.unit
async def test_create_circuit_qiskit_format(client):
    resp = await client.post(
        "/v1/quantum/circuits",
        json={
            "name": "Qiskit Circuit",
            "qasm": '{"qasm": "..."}',
            "num_qubits": 4,
            "format": "qiskit_json",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["format"] == "qiskit_json"


@pytest.mark.unit
async def test_create_circuit_with_description(client):
    resp = await client.post(
        "/v1/quantum/circuits",
        json={
            "name": "Grover",
            "description": "Grover's search algorithm",
            "qasm": BELL_QASM,
            "num_qubits": 4,
            "format": "openqasm3",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["description"] == "Grover's search algorithm"
