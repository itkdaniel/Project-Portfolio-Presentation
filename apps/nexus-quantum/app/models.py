"""
Database models (SQLAlchemy ORM) and Pydantic v2 request/response schemas
for nexus-quantum.

Tables:
  jobs     — async quantum job records (circuit simulation, optimization, VQE)
  circuits — saved named circuit definitions (OpenQASM 3 / Qiskit JSON)
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field
from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ── SQLAlchemy ORM Models ─────────────────────────────────────────────────────

class JobModel(Base):
    """jobs table — one row per submitted quantum job."""
    __tablename__ = "quantum_jobs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    job_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    backend: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    input_payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    result_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CircuitModel(Base):
    """circuits table — saved named circuit definitions."""
    __tablename__ = "quantum_circuits"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qasm: Mapped[str] = mapped_column(Text, nullable=False)
    num_qubits: Mapped[int] = mapped_column(nullable=False, default=1)
    format: Mapped[str] = mapped_column(Text, nullable=False, default="openqasm3")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

JOB_TYPES = {
    "circuit_simulation",
    "portfolio_optimization",
    "route_optimization",
    "constraint_qubo",
    "vqe",
}

JOB_STATUSES = {"pending", "running", "completed", "failed", "cancelled"}

CIRCUIT_FORMATS = {"openqasm3", "qiskit_json", "cirq_json"}


class JobSubmit(BaseModel):
    job_type: str = Field(..., description=f"One of: {sorted(JOB_TYPES)}")
    backend: Optional[str] = Field(None, description="Simulator backend or Azure target")
    input_payload: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class JobResponse(BaseModel):
    id: str
    job_type: str
    status: str
    backend: Optional[str] = None
    input_payload: dict[str, Any] = Field(default_factory=dict)
    result_payload: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    submitted_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SimulateRequest(BaseModel):
    circuit: str = Field(..., description="OpenQASM 3 circuit string or circuit name")
    backend: str = Field("statevector_simulator", description="Simulator backend")
    shots: int = Field(1024, ge=1, le=65536)
    parameters: dict[str, float] = Field(default_factory=dict)


class SimulateResponse(BaseModel):
    backend: str
    shots: int
    counts: dict[str, int]
    statevector: Optional[list[list[float]]] = None
    execution_time_ms: float
    num_qubits: int


class BackendInfo(BaseModel):
    name: str
    description: str
    max_qubits: int
    simulator: bool
    available: bool


class PortfolioOptRequest(BaseModel):
    assets: list[str] = Field(..., min_length=2, description="Asset ticker symbols")
    expected_returns: list[float] = Field(..., description="Expected return per asset")
    covariance_matrix: list[list[float]] = Field(..., description="Asset covariance matrix")
    risk_tolerance: float = Field(0.5, ge=0.0, le=1.0)
    algorithm: str = Field("qaoa", description="qaoa or classical_markowitz")
    num_qubits: Optional[int] = Field(None, description="Override qubit count")


class PortfolioOptResponse(BaseModel):
    weights: dict[str, float]
    expected_return: float
    expected_risk: float
    sharpe_ratio: float
    algorithm_used: str
    classical_baseline: dict[str, float]
    execution_time_ms: float


class RouteOptRequest(BaseModel):
    locations: list[dict[str, float]] = Field(..., min_length=2, description="List of {lat, lon} dicts")
    distance_matrix: Optional[list[list[float]]] = Field(None, description="Precomputed distance matrix")
    algorithm: str = Field("quantum_annealing", description="quantum_annealing or nearest_neighbor")
    num_vehicles: int = Field(1, ge=1, le=10)


class RouteOptResponse(BaseModel):
    optimal_route: list[int]
    total_distance: float
    route_per_vehicle: list[list[int]]
    algorithm_used: str
    classical_baseline: dict[str, Any]
    execution_time_ms: float


class ConstraintRequest(BaseModel):
    variables: list[str] = Field(..., description="Binary variable names")
    qubo_matrix: list[list[float]] = Field(..., description="QUBO coefficient matrix")
    constraints: list[dict[str, Any]] = Field(default_factory=list)
    algorithm: str = Field("simulated_annealing", description="simulated_annealing or qaoa")
    num_reads: int = Field(100, ge=1, le=10000)


class ConstraintResponse(BaseModel):
    solution: dict[str, int]
    energy: float
    feasible: bool
    algorithm_used: str
    classical_baseline: dict[str, Any]
    execution_time_ms: float


class AlgorithmInfo(BaseModel):
    name: str
    description: str
    problem_type: str
    requires_azure: bool
    parameters: dict[str, Any]


class CircuitCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=500)
    qasm: str = Field(..., description="OpenQASM 3 or Qiskit JSON circuit definition")
    num_qubits: int = Field(1, ge=1, le=128)
    format: str = Field("openqasm3", description=f"One of: {sorted(CIRCUIT_FORMATS)}")

    model_config = {"populate_by_name": True}


class CircuitResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    qasm: str
    num_qubits: int
    format: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    uptime: float
    azure_connected: bool


class InfoResponse(BaseModel):
    name: str
    version: str
    port: int
    description: str
    endpoints: list[dict]


class ErrorResponse(BaseModel):
    error: str
    code: str
    details: dict = Field(default_factory=dict)
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
