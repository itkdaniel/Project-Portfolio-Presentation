"""
Circuit CRUD router — /v1/quantum/circuits

Save, list, and retrieve named quantum circuit definitions (OpenQASM 3 or Qiskit JSON).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_dep
from app.models import CircuitCreate, CircuitModel, CircuitResponse, CIRCUIT_FORMATS

router = APIRouter(prefix="/v1/quantum/circuits", tags=["circuits"])


def _model_to_response(circuit: CircuitModel) -> CircuitResponse:
    return CircuitResponse(
        id=circuit.id,
        name=circuit.name,
        description=circuit.description,
        qasm=circuit.qasm,
        num_qubits=circuit.num_qubits,
        format=circuit.format,
        created_at=circuit.created_at,
    )


@router.post("", response_model=CircuitResponse, status_code=201)
async def create_circuit(
    body: CircuitCreate,
    db: AsyncSession = Depends(get_db_dep),
) -> CircuitResponse:
    """Save a named circuit definition (OpenQASM 3 or Qiskit JSON)."""
    if body.format not in CIRCUIT_FORMATS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Unknown format '{body.format}'",
                "code": "INVALID_FORMAT",
                "details": {"valid_formats": sorted(CIRCUIT_FORMATS)},
                "request_id": str(uuid.uuid4()),
            },
        )
    circuit = CircuitModel(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        qasm=body.qasm,
        num_qubits=body.num_qubits,
        format=body.format,
    )
    db.add(circuit)
    await db.flush()
    await db.refresh(circuit)
    return _model_to_response(circuit)


@router.get("", response_model=list[CircuitResponse])
async def list_circuits(
    db: AsyncSession = Depends(get_db_dep),
    limit: int = 50,
    offset: int = 0,
) -> list[CircuitResponse]:
    """List all saved circuit definitions, newest first."""
    result = await db.execute(
        select(CircuitModel)
        .order_by(CircuitModel.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    circuits = result.scalars().all()
    return [_model_to_response(c) for c in circuits]


@router.get("/{circuit_id}", response_model=CircuitResponse)
async def get_circuit(
    circuit_id: str,
    db: AsyncSession = Depends(get_db_dep),
) -> CircuitResponse:
    """Retrieve a single circuit definition by ID."""
    result = await db.execute(
        select(CircuitModel).where(CircuitModel.id == circuit_id)
    )
    circuit = result.scalar_one_or_none()
    if not circuit:
        raise HTTPException(
            status_code=404,
            detail={
                "error": f"Circuit '{circuit_id}' not found",
                "code": "CIRCUIT_NOT_FOUND",
                "details": {},
                "request_id": str(uuid.uuid4()),
            },
        )
    return _model_to_response(circuit)
