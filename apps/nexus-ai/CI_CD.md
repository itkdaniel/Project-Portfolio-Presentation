# CI/CD — nexus-ai

## Pipeline Stages

```
Push/PR
  │
  ├── lint      ── ruff check app/ tests/
  │
  ├── unit      ── pytest tests/unit/ tests/ddt/ tests/regression/
  │
  ├── bdd       ── pytest tests/bdd/   (MockModel, no GPU needed)
  │
  ├── e2e       ── pytest tests/e2e/   (MockModel, no GPU needed)
  │
  └── docker    ── docker build (cache via GHA, push=false on CI)
```

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
