# Contributing to nexus-ai

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready, all CI green |
| `develop` | Integration branch |
| `feat/*` | New features |
| `fix/*` | Bug fixes |
| `chore/*` | Maintenance, deps |

## Commit Format

```
type(scope): short description

Types: feat, fix, perf, refactor, test, docs, chore
Scope: model, tokenizer, router, cache, batch, ci, docs

Examples:
  feat(router): add /v1/ai/rerank endpoint
  perf(cache): switch cache key from MD5 to SHA-256
  fix(tokenizer): handle empty string without crash
  test(e2e): add fill-mask round-trip tests
```

## Code Standards

- **Python**: 3.11+, type hints everywhere, `from __future__ import annotations`
- **Async**: all I/O must be async; wrap `torch` calls in `anyio.to_thread.run_sync()`
- **Error responses**: always use the standard envelope `{error, code, details, request_id}`
- **Cache keys**: SHA-256 of `json.dumps(input, sort_keys=True)`
- **Tests**: mock model in CI — no real training; real model tests are optional/local

## Running Tests

```bash
pip install -r requirements-dev.txt
pytest -v                    # all
pytest tests/unit/ -v        # unit only
pytest tests/e2e/ -v         # e2e only
```

## Pull Request Process

1. Branch from `develop`
2. Write tests first (TDD preferred)
3. Run full test suite — must be green
4. Open PR to `develop`
5. Squash-merge after review
