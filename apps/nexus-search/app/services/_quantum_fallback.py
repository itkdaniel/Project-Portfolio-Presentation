"""
Pure-Python simulated annealing fallback for BM25 parameter tuning.

This module is used ONLY when the real `nexus-shared` PyPI package is not
installed (i.e. in development or CI without the private package).  It is
never imported when `nexus_shared` is available — see app/routers/quantum.py
for the guarded import logic.

Interface mirrors nexus_shared.quantum_utils so the router code is unchanged.
"""
from __future__ import annotations

import math
import random
from typing import List, Optional, Tuple


class _LocalBackend:
    """
    Pure-Python simulated annealing fallback.
    Always sets fallback_used=True — this is the dev/CI stub, not Azure Quantum.
    """

    fallback_used: bool = True
    last_azure_job_id: Optional[str] = None

    def _compute_ndcg(
        self,
        pairs: List[dict],
        k1: float,
        b: float,
        top_k: int = 10,
    ) -> float:
        if not pairs:
            return 0.0

        all_ids: list[str] = []
        id_set: set[str] = set()
        for p in pairs:
            for doc_id in p.get("relevant_doc_ids", []):
                if doc_id not in id_set:
                    id_set.add(doc_id)
                    all_ids.append(doc_id)

        if not all_ids:
            return 0.0

        ndcg_sum = 0.0
        for pair in pairs:
            relevant = set(pair.get("relevant_doc_ids", []))
            if not relevant:
                continue

            scores: list[tuple[float, str]] = []
            for doc_id in all_ids:
                base = 2.0 if doc_id in relevant else 0.5
                score = base * k1 / (k1 + b * (1 - b))
                score += random.gauss(0, 0.05)
                scores.append((score, doc_id))

            scores.sort(key=lambda x: x[0], reverse=True)
            ranked_ids = [doc_id for _, doc_id in scores[:top_k]]

            dcg = sum(
                1.0 / math.log2(rank + 2)
                for rank, doc_id in enumerate(ranked_ids)
                if doc_id in relevant
            )
            ideal = sum(
                1.0 / math.log2(rank + 2)
                for rank in range(min(len(relevant), top_k))
            )
            ndcg_sum += dcg / ideal if ideal > 0 else 0.0

        return ndcg_sum / len(pairs)

    def anneal_bm25_params(
        self,
        pairs: List[dict],
        num_steps: int = 400,
    ) -> Tuple[float, float, float, float]:
        """Return (optimal_k1, optimal_b, quantum_ndcg, baseline_ndcg)."""
        rng = random.Random(42)

        baseline_k1, baseline_b = 1.5, 0.75
        baseline_ndcg = self._compute_ndcg(pairs, baseline_k1, baseline_b)

        best_k1, best_b = baseline_k1, baseline_b
        best_ndcg = baseline_ndcg
        k1, b = best_k1, best_b

        for step in range(num_steps):
            temp = max(0.01, 1.0 - step / num_steps)
            new_k1 = max(0.1, min(5.0, k1 + rng.gauss(0, 0.2 * temp)))
            new_b = max(0.0, min(1.0, b + rng.gauss(0, 0.1 * temp)))
            new_ndcg = self._compute_ndcg(pairs, new_k1, new_b)
            delta = new_ndcg - best_ndcg
            if delta > 0 or rng.random() < math.exp(delta / temp):
                k1, b = new_k1, new_b
                if new_ndcg > best_ndcg:
                    best_k1, best_b, best_ndcg = new_k1, new_b, new_ndcg

        return best_k1, best_b, best_ndcg, baseline_ndcg


_BACKEND = _LocalBackend()


def get_backend() -> _LocalBackend:
    return _BACKEND
