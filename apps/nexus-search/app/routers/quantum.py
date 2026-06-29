"""
POST /v1/search/quantum/tune — Quantum-inspired BM25 parameter optimization.

Accepts a list of (query, relevant_doc_ids) training pairs and finds optimal
BM25 k1 and b parameters by minimising mean reciprocal rank loss via simulated
quantum annealing. Returns the optimized parameters alongside a baseline NDCG
score computed with default BM25(k1=1.5, b=0.75).

Graceful fallback: runs local simulation when AZURE_QUANTUM_WORKSPACE_ID is
absent; the response includes `fallback_used: true`.

Response schema:
  {
    optimal_k1:     float,
    optimal_b:      float,
    quantum_ndcg:   float,
    baseline_ndcg:  float,
    fallback_used:  bool,
    error:          str | null
  }
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from nexus_shared.quantum_utils import get_backend

router = APIRouter(prefix="/v1/search/quantum", tags=["quantum"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class TrainingPair(BaseModel):
    query: str = Field(..., description="Natural language search query")
    relevant_doc_ids: List[str] = Field(
        ..., description="IDs of documents relevant to this query"
    )


class QuantumTuneRequest(BaseModel):
    training_pairs: List[TrainingPair] = Field(
        ...,
        min_length=1,
        max_length=200,
        description="(query, relevant_doc_ids) training pairs for BM25 tuning",
    )
    num_steps: int = Field(
        400,
        ge=50,
        le=2000,
        description="Number of quantum annealing steps",
    )


class QuantumTuneResponse(BaseModel):
    optimal_k1: float
    optimal_b: float
    quantum_ndcg: float
    baseline_ndcg: float
    fallback_used: bool
    error: Optional[str] = None


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/tune",
    response_model=QuantumTuneResponse,
    summary="Quantum-inspired BM25 parameter optimization",
    description=(
        "Accepts (query, relevant_doc_ids) training pairs and uses simulated "
        "quantum annealing to find BM25 k1 and b values that maximise mean "
        "reciprocal rank. Returns optimised parameters alongside the baseline "
        "score at the default BM25(k1=1.5, b=0.75) operating point."
    ),
)
async def quantum_tune(body: QuantumTuneRequest) -> QuantumTuneResponse:
    backend = get_backend()

    pairs = [p.model_dump() for p in body.training_pairs]
    optimal_k1, optimal_b, quantum_ndcg, baseline_ndcg = backend.anneal_bm25_params(
        pairs, num_steps=body.num_steps
    )

    return QuantumTuneResponse(
        optimal_k1=optimal_k1,
        optimal_b=optimal_b,
        quantum_ndcg=quantum_ndcg,
        baseline_ndcg=baseline_ndcg,
        fallback_used=backend.fallback_used,
        error=None,
    )
