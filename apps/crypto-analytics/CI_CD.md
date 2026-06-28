# CI/CD — crypto-analytics

## Pipeline Overview

GitHub Actions runs on every push and PR touching `apps/crypto-analytics/**`.

## Jobs

| Job | Trigger | Description |
|-----|---------|-------------|
| `lint` | push/PR | Ruff linting (PEP 8 + flake8 rules) |
| `test` | push/PR | Pytest unit + BDD + regression tests |
| `docker` | push to main | Docker image build |

## Quantum Endpoint

`POST /v1/analytics/quantum/optimize` is tested in:
- `tests/unit/test_quantum.py` — unit tests asserting response shape and validation
- `tests/bdd/test_quantum_bdd.py` — BDD scenarios (happy path, offline fallback, validation)
- `tests/regression/test_quantum_contract.py` — contract tests pinning field names/types

All tests mock the QuantumBackend; no Azure credentials are needed in CI.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_QUANTUM_WORKSPACE_ID` | No | Azure Quantum workspace ID; if absent, local simulation is used |

## Run Locally

```bash
cd apps/crypto-analytics
pip install -e ".[dev]"
pytest tests/ -v
uvicorn app.main:app --port 8104
```
