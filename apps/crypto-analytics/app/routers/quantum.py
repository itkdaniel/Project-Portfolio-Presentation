"""
POST /v1/analytics/quantum/optimize — Quantum portfolio optimization.

Accepts a list of asset symbols, a returns covariance matrix, and a risk
tolerance scalar. Applies QAOA-inspired optimization to find Pareto-optimal
weights on the efficient frontier. Returns quantum weights alongside classical
Markowitz mean-variance weights for comparison.

Graceful fallback: runs local simulation when AZURE_QUANTUM_WORKSPACE_ID is
absent; the response includes `fallback_used: true`.

Response schema:
  {
    quantum_weights:   { symbol: float },
    classical_weights: { symbol: float },
    quantum_sharpe:    float,
    classical_sharpe:  float,
    fallback_used:     bool,
    error:             str | null
  }
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "_shared"))
from quantum_utils import get_backend  # noqa: E402

router = APIRouter(prefix="/v1/analytics/quantum", tags=["quantum"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class QuantumOptimizeRequest(BaseModel):
    assets: List[str] = Field(
        ...,
        min_length=2,
        max_length=50,
        description="Asset ticker symbols (e.g. BTC, ETH, SOL)",
    )
    cov_matrix: List[List[float]] = Field(
        ...,
        description=(
            "NxN covariance matrix of asset returns. "
            "Must be square with N == len(assets)."
        ),
    )
    risk_tolerance: float = Field(
        0.5,
        ge=0.0,
        le=1.0,
        description="Risk tolerance scalar [0=min-risk, 1=max-return]",
    )
    num_steps: int = Field(
        300,
        ge=50,
        le=2000,
        description="QAOA annealing steps",
    )

    @model_validator(mode="after")
    def validate_matrix_shape(self) -> "QuantumOptimizeRequest":
        n = len(self.assets)
        if len(self.cov_matrix) != n:
            raise ValueError(
                f"cov_matrix must have {n} rows (one per asset), got {len(self.cov_matrix)}"
            )
        for row in self.cov_matrix:
            if len(row) != n:
                raise ValueError(
                    f"Each cov_matrix row must have {n} columns, got {len(row)}"
                )
        return self


class QuantumOptimizeResponse(BaseModel):
    quantum_weights: Dict[str, float]
    classical_weights: Dict[str, float]
    quantum_sharpe: float
    classical_sharpe: float
    fallback_used: bool
    error: Optional[str] = None


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/optimize",
    response_model=QuantumOptimizeResponse,
    summary="Quantum portfolio optimization (QAOA)",
    description=(
        "Applies QAOA-inspired simulated annealing to find Pareto-optimal "
        "portfolio weights on the efficient frontier. Returns quantum weights "
        "alongside classical Markowitz (inverse-variance) weights and Sharpe "
        "ratios for both solutions."
    ),
)
async def quantum_optimize(body: QuantumOptimizeRequest) -> QuantumOptimizeResponse:
    backend = get_backend()

    quantum_weights, classical_weights, quantum_sharpe, classical_sharpe = (
        backend.qaoa_portfolio(
            body.assets,
            body.cov_matrix,
            body.risk_tolerance,
            body.num_steps,
        )
    )

    return QuantumOptimizeResponse(
        quantum_weights=quantum_weights,
        classical_weights=classical_weights,
        quantum_sharpe=quantum_sharpe,
        classical_sharpe=classical_sharpe,
        fallback_used=backend.fallback_used,
        error=None,
    )
