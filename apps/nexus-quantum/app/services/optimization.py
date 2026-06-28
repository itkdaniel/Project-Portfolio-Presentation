"""
Quantum-inspired optimization algorithms.

All algorithms run locally — no Azure credentials required.
Each result includes a `classical_baseline` field for comparison.

Algorithms:
  - portfolio: Markowitz mean-variance + simulated QAOA
  - route:     Nearest-neighbor TSP + quantum annealing heuristic
  - constraint: QUBO → simulated annealing
"""
from __future__ import annotations

import math
import random
import time
from typing import Any


# ── Portfolio Optimization ────────────────────────────────────────────────────

def _markowitz_weights(
    expected_returns: list[float],
    cov_matrix: list[list[float]],
    risk_tolerance: float,
) -> dict[int, float]:
    """Simple mean-variance optimization (equal-weight fallback + risk scaling)."""
    n = len(expected_returns)
    if n == 0:
        return {}
    total_return = sum(expected_returns) or 1.0
    weights = {i: r / total_return for i, r in enumerate(expected_returns)}
    # Risk adjustment: reduce weight for high-variance assets
    variances = [cov_matrix[i][i] for i in range(n)]
    max_var = max(variances) or 1.0
    adjusted = {
        i: w * (1.0 - (1.0 - risk_tolerance) * variances[i] / max_var)
        for i, w in weights.items()
    }
    total = sum(adjusted.values()) or 1.0
    return {i: v / total for i, v in adjusted.items()}


def _qaoa_portfolio(
    expected_returns: list[float],
    cov_matrix: list[list[float]],
    risk_tolerance: float,
    num_assets: int,
) -> dict[int, float]:
    """
    Simulated QAOA portfolio optimization.

    In production (with Azure), this would encode the Markowitz QUBO on a
    gate-based QPU. Here we simulate QAOA convergence via simulated annealing
    of the objective: maximize(return - risk_tolerance * risk).
    """
    n = len(expected_returns)
    best_weights = _markowitz_weights(expected_returns, cov_matrix, risk_tolerance)
    best_score = _portfolio_score(best_weights, expected_returns, cov_matrix, risk_tolerance)

    temp = 1.0
    cooling = 0.95
    current = dict(best_weights)

    for _ in range(200):
        i = random.randint(0, n - 1)
        j = random.randint(0, n - 1)
        if i == j:
            continue
        delta = random.uniform(0, current[i] * 0.1)
        candidate = dict(current)
        candidate[i] = max(0.0, candidate[i] - delta)
        candidate[j] = min(1.0, candidate[j] + delta)
        # Renormalize
        total = sum(candidate.values()) or 1.0
        candidate = {k: v / total for k, v in candidate.items()}
        score = _portfolio_score(candidate, expected_returns, cov_matrix, risk_tolerance)
        if score > best_score or random.random() < math.exp((score - best_score) / temp):
            current = candidate
            if score > best_score:
                best_score = score
                best_weights = candidate
        temp *= cooling

    return best_weights


def _portfolio_score(
    weights: dict[int, float],
    returns: list[float],
    cov: list[list[float]],
    risk_tol: float,
) -> float:
    n = len(returns)
    ret = sum(weights.get(i, 0) * returns[i] for i in range(n))
    risk = sum(
        weights.get(i, 0) * weights.get(j, 0) * cov[i][j]
        for i in range(n)
        for j in range(n)
    )
    return ret - risk_tol * risk


def optimize_portfolio(
    assets: list[str],
    expected_returns: list[float],
    cov_matrix: list[list[float]],
    risk_tolerance: float = 0.5,
    algorithm: str = "qaoa",
) -> dict[str, Any]:
    t0 = time.perf_counter()
    n = len(assets)

    classical_idx = _markowitz_weights(expected_returns, cov_matrix, risk_tolerance)
    classical = {assets[i]: round(classical_idx[i], 6) for i in range(n)}

    if algorithm == "qaoa":
        idx_weights = _qaoa_portfolio(expected_returns, cov_matrix, risk_tolerance, n)
    else:
        idx_weights = classical_idx

    weights = {assets[i]: round(idx_weights[i], 6) for i in range(n)}

    exp_return = sum(idx_weights[i] * expected_returns[i] for i in range(n))
    exp_risk = math.sqrt(max(0, sum(
        idx_weights[i] * idx_weights[j] * cov_matrix[i][j]
        for i in range(n) for j in range(n)
    )))
    sharpe = exp_return / exp_risk if exp_risk > 0 else 0.0

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return {
        "weights": weights,
        "expected_return": round(exp_return, 6),
        "expected_risk": round(exp_risk, 6),
        "sharpe_ratio": round(sharpe, 6),
        "algorithm_used": algorithm,
        "classical_baseline": classical,
        "execution_time_ms": round(elapsed_ms, 3),
    }


# ── Route Optimization (TSP / VRP) ────────────────────────────────────────────

def _euclidean(a: dict, b: dict) -> float:
    return math.sqrt((a["lat"] - b["lat"]) ** 2 + (a["lon"] - b["lon"]) ** 2)


def _build_distance_matrix(locations: list[dict]) -> list[list[float]]:
    n = len(locations)
    return [[_euclidean(locations[i], locations[j]) for j in range(n)] for i in range(n)]


def _nearest_neighbor(dist: list[list[float]], start: int = 0) -> tuple[list[int], float]:
    n = len(dist)
    visited = {start}
    route = [start]
    total = 0.0
    current = start
    for _ in range(n - 1):
        nearest = min(
            (j for j in range(n) if j not in visited),
            key=lambda j: dist[current][j],
        )
        total += dist[current][nearest]
        visited.add(nearest)
        route.append(nearest)
        current = nearest
    total += dist[current][start]
    route.append(start)
    return route, total


def _quantum_annealing_tsp(dist: list[list[float]]) -> tuple[list[int], float]:
    """Simulated quantum annealing for TSP — 2-opt moves with quantum tunneling."""
    n = len(dist)
    route, total = _nearest_neighbor(dist)
    route = route[:-1]  # remove return-to-start for mutation

    best_route = list(route)
    best_dist = total
    temp = 10.0
    cooling = 0.98

    for _ in range(500):
        i, j = sorted(random.sample(range(n), 2))
        candidate = route[:i] + route[i:j + 1][::-1] + route[j + 1:]
        d = sum(dist[candidate[k]][candidate[(k + 1) % n]] for k in range(n))
        delta = d - best_dist
        if delta < 0 or random.random() < math.exp(-delta / (temp + 1e-9)):
            route = candidate
            if d < best_dist:
                best_dist = d
                best_route = list(candidate)
        temp *= cooling

    full_route = best_route + [best_route[0]]
    return full_route, best_dist


def optimize_route(
    locations: list[dict],
    distance_matrix: list[list[float]] | None,
    algorithm: str = "quantum_annealing",
    num_vehicles: int = 1,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    dist = distance_matrix if distance_matrix else _build_distance_matrix(locations)

    classical_route, classical_dist = _nearest_neighbor(dist)
    classical_baseline = {"route": classical_route, "total_distance": round(classical_dist, 6)}

    if algorithm == "quantum_annealing" and len(locations) >= 2:
        route, total = _quantum_annealing_tsp(dist)
    else:
        route, total = classical_route, classical_dist

    # Partition into vehicle sub-routes
    cities = route[:-1]  # exclude return
    chunk = max(1, len(cities) // num_vehicles)
    vehicle_routes = [cities[i:i + chunk] for i in range(0, len(cities), chunk)]

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return {
        "optimal_route": route,
        "total_distance": round(total, 6),
        "route_per_vehicle": vehicle_routes,
        "algorithm_used": algorithm,
        "classical_baseline": classical_baseline,
        "execution_time_ms": round(elapsed_ms, 3),
    }


# ── Constraint / QUBO Solver ──────────────────────────────────────────────────

def _qubo_energy(solution: list[int], qubo: list[list[float]]) -> float:
    n = len(solution)
    return sum(
        qubo[i][j] * solution[i] * solution[j]
        for i in range(n) for j in range(n)
    )


def _simulated_annealing_qubo(
    variables: list[str],
    qubo: list[list[float]],
    num_reads: int,
) -> tuple[dict[str, int], float]:
    n = len(variables)
    best_sol = [random.randint(0, 1) for _ in range(n)]
    best_energy = _qubo_energy(best_sol, qubo)

    for _ in range(num_reads):
        temp = 2.0
        sol = list(best_sol)
        for step in range(n * 10):
            i = random.randint(0, n - 1)
            sol[i] ^= 1
            e = _qubo_energy(sol, qubo)
            if e < best_energy or random.random() < math.exp((best_energy - e) / (temp + 1e-9)):
                if e < best_energy:
                    best_energy = e
                    best_sol = list(sol)
            else:
                sol[i] ^= 1
            temp *= 0.99

    return {variables[i]: best_sol[i] for i in range(n)}, best_energy


def optimize_constraint(
    variables: list[str],
    qubo_matrix: list[list[float]],
    constraints: list[dict],
    algorithm: str = "simulated_annealing",
    num_reads: int = 100,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    n = len(variables)

    solution, energy = _simulated_annealing_qubo(variables, qubo_matrix, num_reads)

    # Check feasibility: all constraint values must be satisfied
    feasible = True
    for c in constraints:
        lhs_vars = c.get("variables", [])
        op = c.get("op", "eq")
        rhs = c.get("rhs", 0)
        lhs = sum(solution.get(v, 0) for v in lhs_vars)
        if op == "eq" and lhs != rhs:
            feasible = False
        elif op == "le" and lhs > rhs:
            feasible = False
        elif op == "ge" and lhs < rhs:
            feasible = False

    classical_baseline = {
        "solution": {v: 0 for v in variables},
        "energy": _qubo_energy([0] * n, qubo_matrix),
        "method": "all-zeros baseline",
    }

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return {
        "solution": solution,
        "energy": round(energy, 6),
        "feasible": feasible,
        "algorithm_used": algorithm,
        "classical_baseline": classical_baseline,
        "execution_time_ms": round(elapsed_ms, 3),
    }


def list_algorithms() -> list[dict[str, Any]]:
    return [
        {
            "name": "qaoa",
            "description": "Quantum Approximate Optimization Algorithm — variational hybrid quantum-classical",
            "problem_type": "portfolio_optimization",
            "requires_azure": False,
            "parameters": {"risk_tolerance": "float [0,1]", "num_qubits": "int"},
        },
        {
            "name": "classical_markowitz",
            "description": "Classical Markowitz mean-variance optimization (baseline)",
            "problem_type": "portfolio_optimization",
            "requires_azure": False,
            "parameters": {"risk_tolerance": "float [0,1]"},
        },
        {
            "name": "quantum_annealing",
            "description": "Simulated quantum annealing with 2-opt TSP moves",
            "problem_type": "route_optimization",
            "requires_azure": False,
            "parameters": {"num_vehicles": "int"},
        },
        {
            "name": "nearest_neighbor",
            "description": "Greedy nearest-neighbor TSP heuristic (baseline)",
            "problem_type": "route_optimization",
            "requires_azure": False,
            "parameters": {},
        },
        {
            "name": "simulated_annealing",
            "description": "Simulated annealing QUBO solver",
            "problem_type": "constraint_qubo",
            "requires_azure": False,
            "parameters": {"num_reads": "int [1, 10000]"},
        },
        {
            "name": "vqe",
            "description": "Variational Quantum Eigensolver — ground state energy estimation",
            "problem_type": "vqe",
            "requires_azure": True,
            "parameters": {"num_layers": "int", "optimizer": "str"},
        },
    ]
