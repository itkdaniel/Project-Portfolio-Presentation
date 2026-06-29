# Changelog — nexus-analytics

All notable changes to this service follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-06-29

### Added
- Initial release of nexus-analytics platform API analytics microservice (port 8300).
- `POST /v1/analytics/events` — ingest a single API call event (service, method,
  endpoint, status_code, latency_ms, error, ts).
- `GET /v1/analytics/summary` — per-service aggregate stats (call count, success/error
  split, average latency, p95 latency) with configurable look-back window.
- `GET /v1/analytics/top-endpoints` — top N endpoints by call volume with per-endpoint
  error rate and average latency; filterable by service name.
- `GET /v1/analytics/errors` — services with non-zero error rate, minimum error-rate
  filter, same aggregate shape as `/summary`.
- `GET /v1/analytics/timeseries` — time-bucketed call/error counts and average latency
  with configurable bucket size (5 min – 24 h).
- `GET /health` — liveness/readiness probe with uptime counter.
- `GET /info` — service metadata and full endpoint catalogue.
- SQLAlchemy async + aiosqlite (dev) / asyncpg PostgreSQL (prod) via `api_events` table.
- Color-coded structured logging: ANSI colour console + rotating JSON-lines file output
  via `nexus_shared.logging_config`.
- Full test suite: 42 unit tests, 6 BDD scenarios, 5 regression contract tests.
- Dockerfile (multi-stage), docker-compose.yml, CI workflow.
