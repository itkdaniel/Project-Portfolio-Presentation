"""
Simulation router — /v1/quantum/simulate

Runs quantum circuits locally using Qiskit Aer or the built-in toy simulator.
No Azure credentials required.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.models import BackendInfo, SimulateRequest, SimulateResponse
from app.services.simulation import list_backends, simulate_circuit

router = APIRouter(prefix="/v1/quantum/simulate", tags=["simulation"])


@router.post("", response_model=SimulateResponse)
async def run_simulation(body: SimulateRequest) -> SimulateResponse:
    """Simulate a quantum circuit and return measurement counts + statevector."""
    result = simulate_circuit(
        circuit_str=body.circuit,
        backend=body.backend,
        shots=body.shots,
    )
    return SimulateResponse(**result)


@router.get("/backends", response_model=list[BackendInfo])
async def get_backends() -> list[BackendInfo]:
    """List available local simulator backends."""
    return [BackendInfo(**b) for b in list_backends()]
