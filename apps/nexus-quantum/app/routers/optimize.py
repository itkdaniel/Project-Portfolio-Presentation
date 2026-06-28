"""
Optimization router — /v1/quantum/optimize

Three quantum-inspired optimization endpoints:
  - POST /v1/quantum/optimize/portfolio  — Markowitz + QAOA portfolio weights
  - POST /v1/quantum/optimize/route      — TSP/VRP via quantum annealing
  - POST /v1/quantum/optimize/constraint — QUBO constraint solver
  - GET  /v1/quantum/optimize/algorithms — list available algorithms
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import (
    AlgorithmInfo,
    ConstraintRequest,
    ConstraintResponse,
    PortfolioOptRequest,
    PortfolioOptResponse,
    RouteOptRequest,
    RouteOptResponse,
)
from app.services.optimization import (
    list_algorithms,
    optimize_constraint,
    optimize_portfolio,
    optimize_route,
)

router = APIRouter(prefix="/v1/quantum/optimize", tags=["optimization"])


@router.post("/portfolio", response_model=PortfolioOptResponse)
async def portfolio_optimization(body: PortfolioOptRequest) -> PortfolioOptResponse:
    """Run Markowitz + QAOA portfolio weight optimization.

    Returns optimal asset weights with classical Markowitz as baseline.
    Includes expected return, risk (std dev), and Sharpe ratio.
    """
    n = len(body.assets)
    if len(body.expected_returns) != n:
        raise HTTPException(
            status_code=400,
            detail="expected_returns length must match assets length",
        )
    if len(body.covariance_matrix) != n or any(len(r) != n for r in body.covariance_matrix):
        raise HTTPException(
            status_code=400,
            detail="covariance_matrix must be an n×n square matrix",
        )
    result = optimize_portfolio(
        assets=body.assets,
        expected_returns=body.expected_returns,
        cov_matrix=body.covariance_matrix,
        risk_tolerance=body.risk_tolerance,
        algorithm=body.algorithm,
    )
    return PortfolioOptResponse(**result)


@router.post("/route", response_model=RouteOptResponse)
async def route_optimization(body: RouteOptRequest) -> RouteOptResponse:
    """Run TSP/VRP route optimization using quantum annealing heuristics.

    Accepts a list of {lat, lon} locations or a precomputed distance matrix.
    Returns the optimal route with a classical nearest-neighbor baseline.
    """
    if body.distance_matrix:
        n = len(body.locations)
        if len(body.distance_matrix) != n or any(len(r) != n for r in body.distance_matrix):
            raise HTTPException(
                status_code=400,
                detail="distance_matrix dimensions must match locations count",
            )
    result = optimize_route(
        locations=[dict(loc) for loc in body.locations],
        distance_matrix=body.distance_matrix,
        algorithm=body.algorithm,
        num_vehicles=body.num_vehicles,
    )
    return RouteOptResponse(**result)


@router.post("/constraint", response_model=ConstraintResponse)
async def constraint_optimization(body: ConstraintRequest) -> ConstraintResponse:
    """Solve a general QUBO constraint satisfaction problem via simulated annealing.

    Encodes the problem as a QUBO matrix and searches for minimum energy solution.
    Returns solution assignments with feasibility check and energy value.
    """
    n = len(body.variables)
    if len(body.qubo_matrix) != n or any(len(r) != n for r in body.qubo_matrix):
        raise HTTPException(
            status_code=400,
            detail="qubo_matrix must be an n×n square matrix matching variables count",
        )
    result = optimize_constraint(
        variables=body.variables,
        qubo_matrix=body.qubo_matrix,
        constraints=body.constraints,
        algorithm=body.algorithm,
        num_reads=body.num_reads,
    )
    return ConstraintResponse(**result)


@router.get("/algorithms", response_model=list[AlgorithmInfo])
async def get_algorithms() -> list[AlgorithmInfo]:
    """List all available optimization algorithms with descriptions and parameters."""
    return [AlgorithmInfo(**a) for a in list_algorithms()]
