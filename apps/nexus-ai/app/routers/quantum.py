"""
POST /v1/ai/quantum/embed — VQE-inspired quantum feature projection.

Accepts pre-embedded text vectors (or raw texts to embed first via the
existing transformer), applies a variational quantum feature map that
projects to a lower-dimensional Hilbert space, and returns quantum-projected
embeddings alongside a classical PCA baseline and a fidelity score.

Graceful fallback: when AZURE_QUANTUM_WORKSPACE_ID is absent the simulation
runs locally; the response includes `fallback_used: true`.

Response schema:
  {
    classical_embeddings: list[list[float]],
    quantum_embeddings:   list[list[float]],
    fidelity:             float,   // mean overlap ∈ [0, 1]
    target_dim:           int,
    fallback_used:        bool,
    error:                str | null
  }
"""
from __future__ import annotations

import hashlib
import math
import os
import sys
import uuid
from pathlib import Path
from typing import Any, List, Optional

import anyio
import numpy as np
import torch
import torch.nn.functional as F
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "_shared"))
from quantum_utils import get_backend  # noqa: E402

router = APIRouter(prefix="/v1/ai/quantum", tags=["quantum"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class QuantumEmbedRequest(BaseModel):
    texts: List[str] = Field(
        ...,
        min_length=1,
        max_length=32,
        description="Texts to embed and project into quantum feature space",
    )
    target_dim: int = Field(
        8,
        ge=2,
        le=64,
        description="Target Hilbert-space dimension for quantum projection",
    )
    num_layers: int = Field(
        3,
        ge=1,
        le=8,
        description="Number of variational quantum circuit layers",
    )


class QuantumEmbedResponse(BaseModel):
    classical_embeddings: List[List[float]]
    quantum_embeddings: List[List[float]]
    fidelity: float
    target_dim: int
    fallback_used: bool
    error: Optional[str] = None


# ── Classical PCA helper ──────────────────────────────────────────────────────

def _pca_project(embeddings: List[List[float]], target_dim: int) -> List[List[float]]:
    """Simple PCA-like projection via SVD (classical baseline)."""
    if not embeddings:
        return []
    mat = np.array(embeddings, dtype=np.float32)
    mat -= mat.mean(axis=0)
    try:
        _, _, Vt = np.linalg.svd(mat, full_matrices=False)
        components = Vt[:target_dim]
        projected = (mat @ components.T).tolist()
        norms = [math.sqrt(sum(x * x for x in row)) or 1.0 for row in projected]
        return [[v / norms[i] for v in row] for i, row in enumerate(projected)]
    except Exception:
        td = min(target_dim, mat.shape[1])
        return [row[:td] for row in embeddings]


def _sync_embed_texts(model, tokenizer, texts: List[str], max_seq_len: int, device: str) -> np.ndarray:
    """Sync helper: tokenize + forward pass → L2-normalized embeddings."""
    all_embeddings = []
    for text in texts:
        enc = tokenizer.encode(text, add_special_tokens=True, max_length=max_seq_len, padding=True)
        input_ids = torch.tensor([enc["input_ids"][:max_seq_len]], dtype=torch.long).to(device)
        with torch.no_grad():
            out = model(input_ids)
        pooled = out["pooled"]
        normed = F.normalize(pooled, p=2, dim=-1)
        all_embeddings.append(normed.cpu().numpy()[0])
    return np.array(all_embeddings)


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/embed",
    response_model=QuantumEmbedResponse,
    summary="VQE-inspired quantum feature projection",
    description=(
        "Embeds input texts using the NexusAI transformer, then applies a "
        "variational quantum feature map (VQE-inspired) to project embeddings "
        "into a lower-dimensional Hilbert space. Returns quantum and classical "
        "(PCA) projections alongside a fidelity score."
    ),
)
async def quantum_embed(body: QuantumEmbedRequest, request: Request) -> QuantumEmbedResponse:
    state = request.app.state
    backend = get_backend()

    model = getattr(state, "model", None)
    tokenizer = getattr(state, "tokenizer", None)
    settings = getattr(state, "settings", None)
    device = getattr(state, "device", "cpu")
    max_seq_len = getattr(settings, "max_seq_len", 128) if settings else 128

    if model is None or tokenizer is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Model not loaded",
                "fallback_used": backend.fallback_used,
            },
        )

    raw_embeddings: np.ndarray = await anyio.to_thread.run_sync(
        lambda: _sync_embed_texts(model, tokenizer, body.texts, max_seq_len, device)
    )

    emb_list: List[List[float]] = raw_embeddings.tolist()

    classical_embeddings = await anyio.to_thread.run_sync(
        lambda: _pca_project(emb_list, body.target_dim)
    )

    quantum_embeddings, fidelity = await anyio.to_thread.run_sync(
        lambda: backend.vqe_feature_map(emb_list, body.target_dim, body.num_layers)
    )

    return QuantumEmbedResponse(
        classical_embeddings=classical_embeddings,
        quantum_embeddings=quantum_embeddings,
        fidelity=fidelity,
        target_dim=body.target_dim,
        fallback_used=backend.fallback_used,
        error=None,
    )
