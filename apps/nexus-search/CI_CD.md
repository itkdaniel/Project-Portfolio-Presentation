# CI/CD — nexus-search

## Pipeline Overview

GitHub Actions runs 5 parallel jobs on every push to `main` and every PR:

| Job | Scope | Duration |
|-----|-------|----------|
| `unit-tests` | Algorithm correctness + quantum tuning | ~30s |
| `ddt-tests` | Hypothesis property invariants | ~60s |
| `bdd-tests` | BDD feature scenarios + quantum tune scenarios | ~45s |
| `regression-tests` | API contract stability + quantum contract | ~45s |
| `e2e-tests` | Full search flow | ~60s |
| `docker-build` | Image build verification | ~120s |

## Quantum Endpoint

`POST /v1/search/quantum/tune` — Quantum-inspired BM25 parameter optimization.

Accepts `(query, relevant_doc_ids)` training pairs and runs simulated quantum
annealing over the `(k1, b)` BM25 parameter space to minimize MRR loss.
Returns `optimal_k1`, `optimal_b`, `quantum_ndcg`, and `baseline_ndcg`.

**Graceful fallback:** when `AZURE_QUANTUM_WORKSPACE_ID` is absent the simulation runs
locally; `fallback_used: true` is set in the response.

Test coverage:
- `tests/unit/test_quantum.py` — 10 unit tests
- `tests/bdd/test_quantum_bdd.py` — 3 BDD scenarios (features/quantum_tune.feature)
- `tests/regression/test_quantum_contract.py` — 5 contract regression tests

## Running Locally

```bash
# All tests
pytest -v

# Single suite
pytest tests/unit/ -v
pytest tests/ddt/ -v
pytest tests/bdd/ -v
pytest tests/regression/ -v
pytest tests/e2e/ -v
```

## Environment Variables (CI)

| Variable | Source | Required |
|----------|--------|----------|
| `GITHUB_TOKEN` | GitHub Actions auto | CI push only |
| `JWT_SECRET` | GitHub Secrets | Production deploy |
| `DATABASE_URL` | GitHub Secrets | Production deploy |
| `REDIS_URL` | GitHub Secrets | Production deploy |

## Deployment

1. CI passes all 6 jobs
2. Docker image built and pushed to GHCR
3. Kubernetes deployment rolling update triggered
4. Health probe confirms `/health` returns `200 OK`
