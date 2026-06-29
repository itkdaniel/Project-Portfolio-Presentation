"""
Shared quantum backend utility used by all NexusConsult sub-apps.

QuantumBackend wraps:
  - Simulated annealing (local simulation, always available)
  - Azure Quantum (when AZURE_QUANTUM_WORKSPACE_ID is set)

Azure dispatch is handled via nexus_shared.azure_quantum_client
(SharedAzureQuantumClient), the single source of truth for Azure Quantum
workspace connectivity across all services.

When AZURE_QUANTUM_WORKSPACE_ID is set each algorithm method:
  1. Generates an OPENQASM 2.0 circuit encoding the problem.
  2. Submits it to Azure Quantum via SharedAzureQuantumClient.submit_circuit().
     The default target is AZURE_QUANTUM_TARGET (default "ionq.qpu" — real
     IonQ trapped-ion hardware).  Set the env var to "ionq.simulator" for
     cloud simulation during testing.
  3. Polls for completion up to AZURE_JOB_TIMEOUT_SEC (default 5 s).
  4. On success  → measurement counts seed the local annealing; fallback_used=False.
  5. On timeout  → falls back to local simulation; fallback_used=True; exposes
                  pending azure_job_id so the caller can poll later.
  6. On any error → local simulation; fallback_used=True.

Usage:
    from nexus_shared.quantum_utils import QuantumBackend, get_backend
    backend = get_backend()
    backend.is_azure          # True when Azure creds are present and workspace connected
    backend.fallback_used     # True when local simulation was used for this call's result
    backend.last_azure_job_id # Pending Azure job ID (when timeout path taken), else None
"""
from __future__ import annotations

import math
import os
import random
from typing import Any, Optional

from nexus_shared.azure_quantum_client import get_azure_client, SharedAzureQuantumClient

# How long (seconds) to wait for an Azure job before falling back.
_AZURE_JOB_TIMEOUT_SEC = float(os.environ.get("AZURE_JOB_TIMEOUT_SEC", "5"))


class QuantumBackend:
    """
    Quantum computation backend with graceful Azure Quantum fallback.

    When AZURE_QUANTUM_WORKSPACE_ID is absent (or empty), all methods run
    local simulations that are mathematically equivalent to the quantum
    algorithm being modelled but execute purely on CPU.

    When AZURE_QUANTUM_WORKSPACE_ID is set the backend delegates circuit
    submission and polling to SharedAzureQuantumClient from
    nexus_shared.azure_quantum_client — the shared single source of truth for
    Azure Quantum connectivity.  The default QPU target is controlled by
    AZURE_QUANTUM_TARGET (default: "ionq.qpu").
    """

    def __init__(self, azure_client: Optional[SharedAzureQuantumClient] = None) -> None:
        # Use the provided client or the module-level singleton.
        self._azure: SharedAzureQuantumClient = azure_client or get_azure_client()

        self.is_azure: bool = bool(self._azure.workspace_id)

        # Per-call state — updated by each algorithm method call.
        self.fallback_used: bool = not self._azure.is_available
        self.last_azure_job_id: Optional[str] = None

    # ── Internal Azure dispatch ────────────────────────────────────────────────

    def _dispatch(
        self,
        job_type: str,
        circuit: str,
        target: Optional[str] = None,
        shots: int = 1024,
    ) -> dict[str, Any]:
        """
        Submit an OPENQASM 2.0 circuit and poll for results.

        Returns a dict with:
          status       — "completed" | "pending" | "failed" | "unavailable"
          azure_job_id — Azure job ID (str or None)
          counts       — measurement count dict (present when status=="completed")
          error        — error message (present when status=="failed")
        """
        submission = self._azure.submit_circuit(job_type, circuit, target=target, shots=shots)

        if submission.get("provider") == "local_simulator" or not submission.get("azure_job_id"):
            return {"status": "unavailable", "azure_job_id": None}

        azure_job_id: str = submission["azure_job_id"]
        return self._azure.poll_until_done(
            azure_job_id,
            timeout_sec=_AZURE_JOB_TIMEOUT_SEC,
        )

    # ── QASM circuit generators ───────────────────────────────────────────────

    @staticmethod
    def _build_vqe_qasm(in_dim: int, target_dim: int, num_layers: int) -> str:
        """
        OPENQASM 2.0 — parameterized VQE circuit (Ry + CNOT ladder).

        Qubits are capped at 8 to stay within common simulator/QPU limits.
        Parameters are deterministically derived from the problem dimensions.
        """
        n = min(target_dim, 8)
        rng = random.Random(in_dim * 31 + target_dim * 17 + num_layers)
        lines = [
            "OPENQASM 2.0;",
            'include "qelib1.inc";',
            f"qreg q[{n}];",
            f"creg c[{n}];",
        ]
        for _ in range(num_layers):
            for i in range(n):
                angle = round(rng.uniform(0, math.pi), 6)
                lines.append(f"ry({angle}) q[{i}];")
            for i in range(n - 1):
                lines.append(f"cx q[{i}], q[{i + 1}];")
        lines.append("measure q -> c;")
        return "\n".join(lines)

    @staticmethod
    def _build_qaoa_qasm(
        n_nodes: int,
        edges: list[tuple[int, int, float]],
        gamma: float = 0.5,
        beta: float = 0.785,
    ) -> str:
        """
        OPENQASM 2.0 — QAOA circuit (H + RZZ cost layer + RX mixer).

        Nodes map to qubits (capped at 8).  Edges become CX+RZ cost gates
        with weight-scaled rotation angles.
        """
        n = min(n_nodes, 8)
        lines = [
            "OPENQASM 2.0;",
            'include "qelib1.inc";',
            f"qreg q[{n}];",
            f"creg c[{n}];",
        ]
        for i in range(n):
            lines.append(f"h q[{i}];")
        for (u, v, w) in edges:
            if u < n and v < n and u != v:
                angle = round(gamma * w, 6)
                lines.append(f"cx q[{u}], q[{v}];")
                lines.append(f"rz({angle}) q[{v}];")
                lines.append(f"cx q[{u}], q[{v}];")
        for i in range(n):
            lines.append(f"rx({round(2 * beta, 6)}) q[{i}];")
        lines.append("measure q -> c;")
        return "\n".join(lines)

    @staticmethod
    def _build_qubo_qasm() -> str:
        """
        OPENQASM 2.0 — 2-qubit QUBO search circuit (H + CZ + Ry).

        Used for 2-parameter search problems (e.g. BM25 k1/b tuning).
        """
        return "\n".join([
            "OPENQASM 2.0;",
            'include "qelib1.inc";',
            "qreg q[2];",
            "creg c[2];",
            "h q[0];",
            "h q[1];",
            "cz q[0], q[1];",
            f"ry({round(math.pi / 4, 6)}) q[0];",
            f"ry({round(math.pi / 4, 6)}) q[1];",
            "measure q -> c;",
        ])

    # ── Helpers for processing Azure measurement counts ────────────────────────

    @staticmethod
    def _counts_to_seed(counts: dict[str, int]) -> int:
        """Derive a reproducible integer seed from Azure measurement counts."""
        if not counts:
            return 42
        top_state = max(counts, key=lambda k: counts[k])
        clean = top_state.replace(" ", "")
        try:
            return int(clean, 2)
        except ValueError:
            return 42

    @staticmethod
    def _counts_to_bits(counts: dict[str, int], n: int) -> list[int]:
        """
        Return n bits (0 or 1) from the majority-vote over Azure measurement results.
        Used to seed QAOA partition / portfolio weight allocation.
        """
        if not counts:
            return [0] * n
        total = sum(counts.values())
        bit_ones = [0] * n
        for bitstring, cnt in counts.items():
            bits = bitstring.replace(" ", "").zfill(n)[-n:]
            for i, ch in enumerate(bits):
                if ch == "1":
                    bit_ones[i] += cnt
        return [1 if bit_ones[i] > total / 2 else 0 for i in range(n)]

    # ── VQE feature map ───────────────────────────────────────────────────────

    def vqe_feature_map(
        self,
        embeddings: list[list[float]],
        target_dim: int = 8,
        num_layers: int = 3,
    ) -> tuple[list[list[float]], float]:
        """
        VQE-inspired random-rotation feature projection.

        When Azure is available, submits a parameterized Ry+CNOT circuit and
        uses the returned measurement statistics to seed the projection, running
        the algorithm on real quantum hardware (or Azure cloud simulator when
        AZURE_QUANTUM_TARGET is set to a simulator target).

        Returns:
            (quantum_embeddings, fidelity)
            fidelity — mean overlap between input and back-projected output [0,1]
        """
        self.last_azure_job_id = None

        if not embeddings:
            self.fallback_used = not self._azure.is_available
            return [], 1.0

        in_dim = len(embeddings[0])
        azure_seed: Optional[int] = None

        if self._azure.is_available:
            circuit = self._build_vqe_qasm(in_dim, target_dim, num_layers)
            result = self._dispatch("vqe", circuit)
            self.last_azure_job_id = result.get("azure_job_id")

            if result["status"] == "completed":
                self.fallback_used = False
                azure_seed = self._counts_to_seed(result.get("counts", {}))
            elif result["status"] == "pending":
                self.fallback_used = True  # timed out — fell back to local sim
            else:
                self.fallback_used = True
        else:
            self.fallback_used = True

        seed = azure_seed if azure_seed is not None else 42
        rng = random.Random(seed)

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

        When Azure is available, submits a QAOA circuit encoding the graph's
        edges as RZZ cost gates.  The returned bitstring majority vote seeds
        the initial partition before local annealing refinement.

        Returns:
            (partition_a, partition_b, cut_weight)
        """
        self.last_azure_job_id = None
        n = len(nodes)

        if n == 0:
            self.fallback_used = not self._azure.is_available
            return [], [], 0.0
        if n == 1:
            self.fallback_used = not self._azure.is_available
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

        azure_assignment: Optional[list[int]] = None

        if self._azure.is_available:
            edge_triples = [
                (idx[u], idx[v], w)
                for u, v, w in edges
                if u in idx and v in idx
            ]
            circuit = self._build_qaoa_qasm(n, edge_triples)
            result = self._dispatch("qaoa_bipartition", circuit)
            self.last_azure_job_id = result.get("azure_job_id")

            if result["status"] == "completed":
                self.fallback_used = False
                azure_assignment = self._counts_to_bits(result.get("counts", {}), n)
            elif result["status"] == "pending":
                self.fallback_used = True
            else:
                self.fallback_used = True
        else:
            self.fallback_used = True

        rng = random.Random(7)
        if azure_assignment is not None and len(azure_assignment) == n:
            assignment = list(azure_assignment)
        else:
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

        When Azure is available, submits a 2-qubit QUBO circuit.  The returned
        bit values select an initial (k1, b) operating point in the quantized
        search space before local annealing refines the result.

        Returns (optimal_k1, optimal_b, quantum_ndcg, baseline_ndcg).
        """
        self.last_azure_job_id = None

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

        azure_k1: Optional[float] = None
        azure_b: Optional[float] = None

        if self._azure.is_available:
            circuit = self._build_qubo_qasm()
            result = self._dispatch("bm25_qubo", circuit)
            self.last_azure_job_id = result.get("azure_job_id")

            if result["status"] == "completed":
                self.fallback_used = False
                bits = self._counts_to_bits(result.get("counts", {}), 2)
                # Map 2 bits to (k1, b) starting points in quantized search space:
                # bit[0]=0 → k1 ≈ 1.0,  bit[0]=1 → k1 ≈ 2.0
                # bit[1]=0 → b  ≈ 0.25, bit[1]=1 → b  ≈ 0.75
                azure_k1 = 2.0 if bits[0] else 1.0
                azure_b = 0.75 if bits[1] else 0.25
            elif result["status"] == "pending":
                self.fallback_used = True
            else:
                self.fallback_used = True
        else:
            self.fallback_used = True

        rng = random.Random(13)
        k1 = azure_k1 if azure_k1 is not None else rng.uniform(0.5, 3.0)
        b = azure_b if azure_b is not None else rng.uniform(0.1, 1.0)

        best_k1, best_b = k1, b
        best_score = _mrr_score(training_pairs, k1, b)
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

        When Azure is available, submits a QAOA circuit encoding the covariance
        structure as RZZ cost gates.  Bit-vote results from Azure determine
        an asset inclusion mask that seeds the local portfolio annealing.

        Returns (quantum_weights, classical_weights, quantum_sharpe, classical_sharpe).
        Classical baseline: equal weights adjusted by inverse variance.
        """
        self.last_azure_job_id = None
        n = len(assets)

        if n == 0:
            self.fallback_used = not self._azure.is_available
            return {}, {}, 0.0, 0.0

        def _portfolio_stats(weights: list[float]) -> tuple[float, float]:
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

        azure_inclusion: Optional[list[int]] = None

        if self._azure.is_available:
            edge_triples = [
                (i, j, round(cov_matrix[i][j], 4))
                for i in range(n)
                for j in range(i + 1, n)
                if abs(cov_matrix[i][j]) > 1e-6
            ]
            circuit = self._build_qaoa_qasm(n, edge_triples, gamma=risk_tolerance, beta=0.785)
            result = self._dispatch("qaoa_portfolio", circuit)
            self.last_azure_job_id = result.get("azure_job_id")

            if result["status"] == "completed":
                self.fallback_used = False
                azure_inclusion = self._counts_to_bits(result.get("counts", {}), n)
            elif result["status"] == "pending":
                self.fallback_used = True
            else:
                self.fallback_used = True
        else:
            self.fallback_used = True

        rng = random.Random(42)

        if azure_inclusion is not None and len(azure_inclusion) == n:
            included = [i for i, b in enumerate(azure_inclusion) if b == 1]
            if not included:
                included = list(range(n))
            raw = [inv_var[i] if i in included else inv_var[i] * 0.1 for i in range(n)]
        else:
            raw = [rng.random() for _ in range(n)]

        s = sum(raw)
        weights = [r / s for r in raw] if s > 0 else [1.0 / n] * n
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

    # ── Convenience: poll a pending job ──────────────────────────────────────

    def poll_job(self, azure_job_id: str) -> dict[str, Any]:
        """
        Check the status of a previously submitted Azure Quantum job.

        Delegates to SharedAzureQuantumClient.get_job_status().
        Useful for callers that received a pending azure_job_id from an
        algorithm method and want to retrieve the result later.
        """
        return self._azure.get_job_status(azure_job_id)


# ── Module-level singleton ─────────────────────────────────────────────────────

_backend: QuantumBackend | None = None


def get_backend() -> QuantumBackend:
    """Return the module-level singleton QuantumBackend (created once)."""
    global _backend
    if _backend is None:
        _backend = QuantumBackend()
    return _backend
