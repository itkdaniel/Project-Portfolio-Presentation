"""
Job management router — /v1/quantum/jobs

Universal async job lifecycle: submit → poll → cancel.

POST /v1/quantum/jobs
  Saves the job as ``pending`` and returns immediately (HTTP 202).
  A background asyncio task then processes the job and transitions
  the status to ``completed`` or ``failed``.

GET  /v1/quantum/jobs/{id}   — poll status + retrieve results
GET  /v1/quantum/jobs        — list jobs
DELETE /v1/quantum/jobs/{id} — cancel a pending job

Supported job_types: circuit_simulation, portfolio_optimization,
                     route_optimization, constraint_qubo, vqe.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, get_db_dep
from app.models import (
    JOB_TYPES,
    JobModel,
    JobResponse,
    JobSubmit,
)

router = APIRouter(prefix="/v1/quantum/jobs", tags=["jobs"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _model_to_response(job: JobModel) -> JobResponse:
    try:
        input_payload = json.loads(job.input_payload or "{}")
    except (json.JSONDecodeError, TypeError):
        input_payload = {}
    result_payload = None
    if job.result_payload:
        try:
            result_payload = json.loads(job.result_payload)
        except (json.JSONDecodeError, TypeError):
            result_payload = None
    return JobResponse(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        backend=job.backend,
        input_payload=input_payload,
        result_payload=result_payload,
        error_message=job.error_message,
        submitted_at=job.submitted_at,
        completed_at=job.completed_at,
    )


def _dispatch(job_type: str, input_payload: dict, backend: str | None) -> dict[str, Any]:
    """Synchronous computation dispatch — called from the async background task."""
    if job_type == "circuit_simulation":
        from app.services.simulation import simulate_circuit
        circuit = input_payload.get("circuit", "")
        shots = input_payload.get("shots", 1024)
        return simulate_circuit(circuit, backend=backend or "toy_statevector", shots=shots)

    if job_type == "portfolio_optimization":
        from app.services.optimization import optimize_portfolio
        return optimize_portfolio(
            assets=input_payload.get("assets", []),
            expected_returns=input_payload.get("expected_returns", []),
            cov_matrix=input_payload.get("covariance_matrix", [[]]),
            risk_tolerance=input_payload.get("risk_tolerance", 0.5),
            algorithm=input_payload.get("algorithm", "qaoa"),
        )

    if job_type == "route_optimization":
        from app.services.optimization import optimize_route
        return optimize_route(
            locations=input_payload.get("locations", []),
            distance_matrix=input_payload.get("distance_matrix"),
            algorithm=input_payload.get("algorithm", "quantum_annealing"),
            num_vehicles=input_payload.get("num_vehicles", 1),
        )

    if job_type == "constraint_qubo":
        from app.services.optimization import optimize_constraint
        return optimize_constraint(
            variables=input_payload.get("variables", []),
            qubo_matrix=input_payload.get("qubo_matrix", [[]]),
            constraints=input_payload.get("constraints", []),
            algorithm=input_payload.get("algorithm", "simulated_annealing"),
            num_reads=input_payload.get("num_reads", 100),
        )

    if job_type == "vqe":
        return {
            "ground_state_energy": -1.1372838,
            "num_iterations": 100,
            "converged": True,
            "note": "Mock VQE result — connect Azure credentials for real QPU dispatch",
        }

    raise ValueError(f"Unknown job_type: {job_type}")


async def _process_job(job_id: str, job_type: str, input_payload_raw: str, backend: str | None) -> None:
    """Background task: transition pending → completed/failed within a single DB session."""
    try:
        input_payload = json.loads(input_payload_raw or "{}")
    except (json.JSONDecodeError, TypeError):
        input_payload = {}

    result: dict[str, Any] | None = None
    error: str | None = None

    async with get_db() as db:
        # Re-fetch the job row to verify it's still pending before processing
        row = (await db.execute(select(JobModel).where(JobModel.id == job_id))).scalar_one_or_none()
        if not row or row.status not in ("pending",):
            return  # Already processed or cancelled

        row.status = "running"
        await db.flush()

        try:
            if job_type == "vqe":
                from app.services.azure_quantum import get_azure_service
                svc = get_azure_service()
                if svc.is_available:
                    result = await svc.submit_job(
                        job_type="vqe",
                        target=backend or "ionq.simulator",
                        circuit=input_payload_raw,
                    )
                else:
                    result = _dispatch("vqe", input_payload, backend)
            else:
                result = await asyncio.to_thread(_dispatch, job_type, input_payload, backend)
        except Exception as exc:
            error = str(exc)

        row.status = "failed" if error else "completed"
        row.result_payload = json.dumps(result) if result else None
        row.error_message = error
        row.completed_at = datetime.now(timezone.utc)
        await db.flush()


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=JobResponse, status_code=201)
async def submit_job(
    body: JobSubmit,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_dep),
) -> JobResponse:
    """Submit a quantum job.  Returns HTTP 201 with status=pending immediately.
    Poll GET /v1/quantum/jobs/{id} to track progress.
    """
    if body.job_type not in JOB_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Unknown job_type '{body.job_type}'",
                "code": "INVALID_JOB_TYPE",
                "details": {"valid_types": sorted(JOB_TYPES)},
                "request_id": str(uuid.uuid4()),
            },
        )

    input_payload_raw = json.dumps(body.input_payload)
    job = JobModel(
        id=str(uuid.uuid4()),
        job_type=body.job_type,
        status="pending",
        backend=body.backend,
        input_payload=input_payload_raw,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Commit NOW so the row is visible in the database before the background
    # task runs.  FastAPI dependency teardown commits AFTER background tasks
    # start — without this explicit commit the background task's SELECT would
    # find no row and return early, leaving the job stuck in "pending".
    await db.commit()

    # Process asynchronously after response is sent so we return 201/pending
    # immediately.  FastAPI BackgroundTasks run after the response is sent.
    background_tasks.add_task(
        _process_job, job.id, job.job_type, input_payload_raw, job.backend
    )

    return _model_to_response(job)


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    db: AsyncSession = Depends(get_db_dep),
    limit: int = 50,
    offset: int = 0,
) -> list[JobResponse]:
    """List all submitted jobs, newest first."""
    result = await db.execute(
        select(JobModel).order_by(JobModel.submitted_at.desc()).limit(limit).offset(offset)
    )
    jobs = result.scalars().all()
    return [_model_to_response(j) for j in jobs]


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db_dep),
) -> JobResponse:
    """Poll job status and retrieve results once completed."""
    result = await db.execute(select(JobModel).where(JobModel.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=404,
            detail={
                "error": f"Job '{job_id}' not found",
                "code": "JOB_NOT_FOUND",
                "details": {},
                "request_id": str(uuid.uuid4()),
            },
        )
    return _model_to_response(job)


@router.delete("/{job_id}", status_code=204)
async def cancel_job(
    job_id: str,
    db: AsyncSession = Depends(get_db_dep),
) -> None:
    """Cancel a pending job.  No-op if already running, completed, or failed."""
    result = await db.execute(select(JobModel).where(JobModel.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=404,
            detail={
                "error": f"Job '{job_id}' not found",
                "code": "JOB_NOT_FOUND",
                "details": {},
                "request_id": str(uuid.uuid4()),
            },
        )
    if job.status == "pending":
        job.status = "cancelled"
        job.completed_at = datetime.now(timezone.utc)
        await db.flush()
