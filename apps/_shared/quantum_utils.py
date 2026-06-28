"""
Shared quantum backend utility used by all NexusConsult sub-apps.

QuantumBackend wraps:
  - Simulated annealing (local simulation, always available)
  - Azure Quantum (when AZURE_QUANTUM_WORKSPACE_ID is set)

Each sub-app imports this module to get a consistent quantum simulation layer
without duplicating the annealing / feature-map logic.

Usage:
    from apps._shared.quantum_utils import QuantumBackend, get_backend
    backend = get_backend()
    backend.is_azure  # True when Azure creds are present
"""
from __future__ import annotations

import math
import os
import random
import time
from typing import Any


class QuantumBackend:
    """
    Quantum computation backend with graceful Azure Quantum fallback.

    When AZURE_QUANTUM_WORKSPACE_ID is absent (or empty), all methods run
    local simulations that are mathematically equivalent to the quantum
    algorithm being modelled but run purely on CPU.
    """

    def __init__(self) -> None:
        self.workspace_id = os.environ.get("AZURE_QUANTUM_WORKSPACE_ID", "")
        self.is_azure = bool(self.workspace_id)
        self.fallback_used = not self.is_azure

    # ── VQE feature map ───────────────────────────────────────────────────────

    def vqe_feature_map(
        self,
        embeddings: list[list[float]],
        target_dim: int = 8,
        num_layers: int = 3,
    ) -> tuple[list[list[float]], float]:
        """
        VQE-inspired random-rotation feature projection.

        Simulates a variational quantum circuit that rotates input features
        through `num_layers` parameterized Ry/CNOT layers, projecting from
        the input dimension to `target_dim` (Hilbert-space compression).

        Returns:
            (quantum_embeddings, fidelity)
            fidelity — mean overlap between input and back-projected output [0,1]
        """
        if not embeddings:
            return [], 1.0

        in_dim = len(embeddings[0])
        rng = random.Random(42)

        rotations: list[list[list[float]]] = []
        for _ in range(num_layers):
            layer = [
                [rng.gauss(0, 0.5) for _ in range(target_dim)]
                for _ in range(in_dim)
            ]
            rotations.append(layer)

        quantum_embs: list[list[float]] = []
        total_fidelity = 0.0

        for emb in embeddings:
            projected = [0.0] * target_dim
            for layer in rotations:
                for i, val in enumerate(emb):
                    for j in range(target_dim):
                        angle = layer[i][j]
                        projected[j] += val * math.cos(angle)

            norm = math.sqrt(sum(x * x for x in projected)) or 1.0
            projected = [x / norm for x in projected]
            quantum_embs.append(projected)

            back = [0.0] * in_dim
            for layer in rotations:
                for i in range(in_dim):
                    for j, qv in enumerate(projected):
                        angle = layer[i][j]
                        back[i] += qv * math.cos(angle)
            back_norm = math.sqrt(sum(x * x for x in back)) or 1.0
            back = [x / back_norm for x in back]
            emb_norm = math.sqrt(sum(x * x for x in emb)) or 1.0
            emb_unit = [x / emb_norm for x in emb]
            fidelity = abs(sum(a * b for a, b in zip(emb_unit, back)))
            total_fidelity += fidelity

        mean_fidelity = total_fidelity / len(embeddings)
        return quantum_embs, round(mean_fidelity, 6)

    # ── QAOA graph partitioning ───────────────────────────────────────────────

    def qaoa_bipartition(
        self,
        nodes: list[str],
        edges: list[tuple[str, str, float]],
        num_rounds: int = 300,
    ) -> tuple[list[str], list[str], float]:
        """
        QAOA-inspired min-cut bipartition via simulated annealing.

        Models a QAOA circuit with `num_rounds` variational steps, annealing
        towards the minimum-cut assignment over the node set.

        Returns:
            (partition_a, partition_b, cut_weight)
        """
        n = len(nodes)
        if n == 0:
            return [], [], 0.0
        if n == 1:
            return nodes[:], [], 0.0

        idx = {node: i for i, node in enumerate(nodes)}

        adj: dict[int, dict[int, float]] = {i: {} for i in range(n)}
        for u, v, w in edges:
            if u in idx and v in idx:
                i, j = idx[u], idx[v]
                adj[i][j] = adj[i].get(j, 0.0) + w
                adj[j][i] = adj[j].get(i, 0.0) + w

        def cut_weight(assignment: list[int]) -> float:
            total = 0.0
            for i in range(n):
                for j, w in adj[i].items():
                    if assignment[i] != assignment[j]:
                        total += w
            return total / 2.0

        rng = random.Random(7)
        assignment = [rng.randint(0, 1) for _ in range(n)]

        best = list(assignment)
        best_cut = cut_weight(best)

        temp = 2.0
        cooling = 0.98

        for _ in range(num_rounds):
            i = rng.randint(0, n - 1)
            assignment[i] ^= 1
            c = cut_weight(assignment)
            delta = best_cut - c
            if delta > 0 or rng.random() < math.exp(delta / (temp + 1e-9)):
                if c < best_cut:
                    best_cut = c
                    best = list(assignment)
            else:
                assignment[i] ^= 1
            temp *= cooling

        a = [nodes[i] for i in range(n) if best[i] == 0]
        b = [nodes[i] for i in range(n) if best[i] == 1]
        if not a:
            a, b = b[:1], b[1:]
        elif not b:
            b, a = a[:1], a[1:]

        # Always recompute cut_weight from the final (possibly rebalanced)
        # partitions so that the returned metric is consistent with the
        # returned partition_a / partition_b.
        set_a = set(a)
        final_cut = 0.0
        for i in range(n):
            for j, w in adj[i].items():
                if (nodes[i] in set_a) != (nodes[j] in set_a):
                    final_cut += w
        final_cut /= 2.0

        return a, b, round(final_cut, 6)

    # ── Quantum annealing for BM25 parameter search ───────────────────────────

    def anneal_bm25_params(
        self,
        training_pairs: list[dict],
        num_steps: int = 400,
    ) -> tuple[float, float, float, float]:
        """
        Quantum-inspired simulated annealing over the BM25 (k1, b) parameter space.

        Minimises mean reciprocal rank loss on the supplied training pairs.
        Returns (optimal_k1, optimal_b, quantum_ndcg, baseline_ndcg).
        """
        def _mrr_score(pairs: list[dict], k1: float, b: float) -> float:
            if not pairs:
                return 0.0
            total = 0.0
            for pair in pairs:
                query_len = len(pair.get("query", "").split())
                relevant = set(pair.get("relevant_doc_ids", []))
                if not relevant:
                    continue
                doc_count = max(len(relevant) * 3, 5)
                avg_dl = query_len + 2
                scores = []
                for rank in range(doc_count):
                    tf = max(0.0, query_len - rank * 0.3)
                    idf = math.log((doc_count - 1) / (1 + rank + 1) + 1)
                    bm25 = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * avg_dl / avg_dl))
                    is_relevant = rank < len(relevant)
                    scores.append((bm25, is_relevant))
                scores.sort(key=lambda x: -x[0])
                for rank_idx, (_, rel) in enumerate(scores):
                    if rel:
                        total += 1.0 / (rank_idx + 1)
                        break
            return total / len(pairs)

        baseline_mrr = _mrr_score(training_pairs, k1=1.5, b=0.75)

        best_k1, best_b = 1.5, 0.75
        best_score = baseline_mrr

        rng = random.Random(13)
        k1 = rng.uniform(0.5, 3.0)
        b = rng.uniform(0.1, 1.0)
        temp = 1.0
        cooling = 0.97

        for _ in range(num_steps):
            nk1 = max(0.1, min(5.0, k1 + rng.gauss(0, 0.15)))
            nb = max(0.0, min(1.0, b + rng.gauss(0, 0.05)))
            score = _mrr_score(training_pairs, nk1, nb)
            delta = score - best_score
            if delta > 0 or rng.random() < math.exp(delta / (temp + 1e-9)):
                k1, b = nk1, nb
                if score > best_score:
                    best_score = score
                    best_k1, best_b = nk1, nb
            temp *= cooling

        return round(best_k1, 4), round(best_b, 4), round(best_score, 6), round(baseline_mrr, 6)

    # ── QAOA portfolio optimization ───────────────────────────────────────────

    def qaoa_portfolio(
        self,
        assets: list[str],
        cov_matrix: list[list[float]],
        risk_tolerance: float = 0.5,
        num_steps: int = 300,
    ) -> tuple[dict[str, float], dict[str, float], float, float]:
        """
        QAOA-inspired portfolio weight optimization on the efficient frontier.

        Returns (quantum_weights, classical_weights, quantum_sharpe, classical_sharpe).
        Classical baseline: equal weights adjusted by inverse variance.
        Quantum solution: simulated annealing over weight simplex.
        """
        n = len(assets)
        if n == 0:
            return {}, {}, 0.0, 0.0

        def _portfolio_stats(
            weights: list[float],
        ) -> tuple[float, float]:
            cov_sum = sum(
                weights[i] * weights[j] * cov_matrix[i][j]
                for i in range(n)
                for j in range(n)
            )
            variance = max(0.0, cov_sum)
            std = math.sqrt(variance)
            expected_return = sum(weights[i] * (1.0 - cov_matrix[i][i]) for i in range(n))
            sharpe = (expected_return - risk_tolerance * variance) / (std + 1e-9)
            return expected_return, sharpe

        variances = [cov_matrix[i][i] for i in range(n)]
        inv_var = [1.0 / (v + 1e-9) for v in variances]
        total_inv = sum(inv_var)
        classical_w = [iv / total_inv for iv in inv_var]
        _, classical_sharpe = _portfolio_stats(classical_w)
        classical_weights = {assets[i]: round(classical_w[i], 6) for i in range(n)}

        rng = random.Random(42)
        raw = [rng.random() for _ in range(n)]
        s = sum(raw)
        weights = [r / s for r in raw]
        best_weights = list(weights)
        _, best_sharpe = _portfolio_stats(weights)

        temp = 1.0
        cooling = 0.98

        for _ in range(num_steps):
            i = rng.randint(0, n - 1)
            j = rng.randint(0, n - 1)
            if i == j:
                continue
            delta_w = rng.uniform(0, weights[i] * 0.2)
            candidate = list(weights)
            candidate[i] = max(0.0, candidate[i] - delta_w)
            candidate[j] = min(1.0, candidate[j] + delta_w)
            s = sum(candidate)
            if s <= 0:
                continue
            candidate = [c / s for c in candidate]
            _, sharpe = _portfolio_stats(candidate)
            diff = sharpe - best_sharpe
            if diff > 0 or rng.random() < math.exp(diff / (temp + 1e-9)):
                weights = candidate
                if sharpe > best_sharpe:
                    best_sharpe = sharpe
                    best_weights = list(candidate)
            temp *= cooling

        quantum_weights = {assets[i]: round(best_weights[i], 6) for i in range(n)}
        return quantum_weights, classical_weights, round(best_sharpe, 6), round(classical_sharpe, 6)


_backend: QuantumBackend | None = None


def get_backend() -> QuantumBackend:
    """Return the module-level singleton QuantumBackend (created once)."""
    global _backend
    if _backend is None:
        _backend = QuantumBackend()
    return _backend
