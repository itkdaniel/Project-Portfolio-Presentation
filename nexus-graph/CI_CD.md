# CI/CD — nexus-graph

## Pipeline Overview

GitHub Actions (`.github/workflows/nexus-graph-ci.yml`) runs on every push/PR touching `nexus-graph/**`.

## Jobs

| Job | Description |
|-----|-------------|
| `lint` | Ruff linting (`ruff check app/ tests/`) |
| `test` | Pytest — unit + graph-engine + quantum + regression + BDD |
| `frontend-build` | TypeScript check + Vite build |
| `docker` | Docker image build (needs test + frontend-build) |

## Quantum Endpoint

`POST /v1/graph/quantum/partition` — QAOA-inspired graph bipartitioning.

Accepts a list of nodes and edges, applies simulated quantum annealing to find
a minimum-cut bipartition, and returns both partitions alongside a greedy
classical baseline for comparison.

**Graceful fallback:** when `AZURE_QUANTUM_WORKSPACE_ID` is absent the simulation runs
locally; `fallback_used: true` is set in the response.

Test coverage:
- `tests/unit/test_quantum.py` — 12 unit tests
- `tests/bdd/test_quantum_bdd.py` — 3 BDD scenarios (features/quantum_partition.feature)
- `tests/regression/test_quantum_contract.py` — 5 contract regression tests

All tests mock `app.database.init_db` so no PostgreSQL is needed in CI.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_QUANTUM_WORKSPACE_ID` | No | Azure workspace; absent → local simulation |
| `NEXUS_GRAPH_ADMIN_TOKEN` | No | Admin auth token for `POST /v1/graph/relations` |

## Run Locally

```bash
cd nexus-graph
pip install -e ".[dev]"
pytest tests/ -v
uvicorn app.main:app --port 8006
```
