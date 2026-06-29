"""
POST /v1/graph/quantum/partition — QAOA-inspired quantum graph bipartitioning.

Accepts a list of entity nodes and weighted edges (same schema as the existing
graph endpoints), computes a minimum-cut bipartition via QAOA-inspired
simulated annealing, and returns both partitions alongside a greedy classical
Kernighan-Lin baseline for comparison.

Graceful fallback: runs local simulation when AZURE_QUANTUM_WORKSPACE_ID is
absent; the response includes `fallback_used: true`.

Response schema:
  {
    partition_a:          list[str],
    partition_b:          list[str],
    cut_weight:           float,
    classical_cut_weight: float,
    improvement_pct:      float,
    fallback_used:        bool,
    error:                str | null
  }
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from nexus_shared.quantum_utils import get_backend

router = APIRouter(prefix="/v1/graph/quantum", tags=["quantum"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PartitionEdge(BaseModel):
    source: str = Field(..., description="Source node ID")
    target: str = Field(..., description="Target node ID")
    weight: float = Field(1.0, ge=0.0, description="Edge weight")


class QuantumPartitionRequest(BaseModel):
    nodes: List[str] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Node IDs to partition (minimum 2 required for partitioning)",
    )
    edges: List[PartitionEdge] = Field(
        default_factory=list,
        max_length=5000,
        description="Weighted edges between nodes",
    )
    num_rounds: int = Field(
        300,
        ge=50,
        le=2000,
        description="QAOA annealing rounds",
    )


class QuantumPartitionResponse(BaseModel):
    partition_a: List[str]
    partition_b: List[str]
    cut_weight: float
    classical_cut_weight: float
    improvement_pct: float
    fallback_used: bool
    azure_job_id: Optional[str] = None
    error: Optional[str] = None


# ── Classical greedy bipartition baseline ─────────────────────────────────────

def _greedy_bipartition(
    nodes: List[str],
    edges: List[PartitionEdge],
) -> tuple[List[str], List[str], float]:
    """
    Greedy Kernighan-Lin inspired bipartition: split nodes at median degree.
    Used as the classical baseline for comparison.
    """
    n = len(nodes)
    half = n // 2
    degree: dict[str, float] = {node: 0.0 for node in nodes}
    for e in edges:
        degree[e.source] = degree.get(e.source, 0.0) + e.weight
        degree[e.target] = degree.get(e.target, 0.0) + e.weight

    sorted_nodes = sorted(nodes, key=lambda nd: -degree.get(nd, 0.0))
    part_a = sorted_nodes[:half]
    part_b = sorted_nodes[half:]

    set_a = set(part_a)
    cut = sum(
        e.weight for e in edges
        if (e.source in set_a) != (e.target in set_a)
    )
    return part_a, part_b, round(cut, 6)


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/partition",
    response_model=QuantumPartitionResponse,
    summary="QAOA quantum graph bipartitioning",
    description=(
        "Accepts a set of nodes and edges, then uses QAOA-inspired simulated "
        "annealing to find a min-cut bipartition of the graph. Returns both "
        "partitions, the quantum cut weight, and a classical greedy baseline "
        "for direct comparison."
    ),
)
async def quantum_partition(body: QuantumPartitionRequest) -> QuantumPartitionResponse:
    backend = get_backend()

    if len(body.nodes) < 2:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "At least 2 nodes are required for partitioning",
                "fallback_used": backend.fallback_used,
            },
        )

    edge_tuples = [(e.source, e.target, e.weight) for e in body.edges]

    partition_a, partition_b, cut_weight = backend.qaoa_bipartition(
        body.nodes, edge_tuples, num_rounds=body.num_rounds
    )

    _, _, classical_cut = _greedy_bipartition(body.nodes, body.edges)

    if classical_cut > 0:
        improvement_pct = round((classical_cut - cut_weight) / classical_cut * 100, 2)
    else:
        improvement_pct = 0.0

    return QuantumPartitionResponse(
        partition_a=partition_a,
        partition_b=partition_b,
        cut_weight=cut_weight,
        classical_cut_weight=classical_cut,
        improvement_pct=improvement_pct,
        fallback_used=backend.fallback_used,
        azure_job_id=backend.last_azure_job_id,
        error=None,
    )
