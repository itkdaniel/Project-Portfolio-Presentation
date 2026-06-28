# CI/CD — nexus-ai

## Pipeline Stages

```
Push/PR
  │
  ├── lint      ── ruff check app/ tests/
  │
  ├── unit      ── pytest tests/unit/ tests/ddt/ tests/regression/
  │               includes: test_quantum.py (response shape, validation, 503 on no model)
  │               includes: test_quantum_contract.py (field name/type pinning)
  │
  ├── bdd       ── pytest tests/bdd/   (MockModel, no GPU needed)
  │               includes: test_quantum_bdd.py (happy path, offline fallback, validation)
  │               features: quantum_embed.feature
  │
  ├── e2e       ── pytest tests/e2e/   (MockModel, no GPU needed)
  │
  └── docker    ── docker build (cache via GHA, push=false on CI)
```

## Quantum Endpoint

`POST /v1/ai/quantum/embed` — VQE-inspired quantum feature projection.

Accepts texts, embeds them with the NexusTransformer, then applies a variational
quantum feature map (parameterized Ry/CNOT layers) to project to a lower Hilbert-space
dimension. Returns quantum projections, classical PCA baseline, and a fidelity score.

**Graceful fallback:** when `AZURE_QUANTUM_WORKSPACE_ID` is absent the simulation runs
locally; `fallback_used: true` is set in the response.

Test coverage:
- `tests/unit/test_quantum.py` — 10 unit tests
- `tests/bdd/test_quantum_bdd.py` — 3 BDD scenarios
- `tests/regression/test_quantum_contract.py` — 6 contract regression tests

All stages except `docker` run in parallel. `docker` waits for all tests to pass.

## GitHub Actions

`.github/workflows/ci.yml` runs on every push to `main`/`develop` and on PRs to `main`.

### Key design decisions:
- **Mock model everywhere in CI**: real PyTorch forward passes take 10-60s per test;
  MockModel completes the entire suite in <30s
- **No GPU runner needed**: all test stages use standard `ubuntu-latest`
- **Docker build cached**: `type=gha` cache keeps build time under 2 minutes

## Deployment

```bash
# Build and push to GHCR
docker build -t ghcr.io/itkdaniel/nexus-ai:latest .
docker push ghcr.io/itkdaniel/nexus-ai:latest

# Deploy to K8s (update image tag)
kubectl set image deployment/nexus-ai nexus-ai=ghcr.io/itkdaniel/nexus-ai:latest -n nexus
```

## Environment Variables in CI

Set these as GitHub repository secrets:
- `GHCR_TOKEN` — GitHub PAT with `write:packages` for container push

For production deployment:
- `REDIS_URL` — production Redis connection string
- `MODEL_CHECKPOINT` — path or URL to trained model checkpoint

## Health Check

The Dockerfile includes a health check:
```
GET /health → {"status": "ok", "model_loaded": true, ...}
```

Kubernetes readiness/liveness:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8001
  initialDelaySeconds: 30
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health
    port: 8001
  initialDelaySeconds: 10
  periodSeconds: 10
```
