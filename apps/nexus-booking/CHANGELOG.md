# Changelog — nexus-booking

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2024-01-15

### Added
- Full booking CRUD (create, read, update, cancel, delete) via async FastAPI endpoints
- O(1) availability index built at startup in O(n) using an in-memory slot map
- HMAC-SHA256 JWT authentication with role-based access control (admin / user)
- Async email dispatch via `aiosmtplib` with fire-and-forget background tasks
- Alembic migration baseline for PostgreSQL schema
- SQLite in-memory backend for tests (zero external deps in CI)
- Unit tests, BDD scenarios (pytest-bdd), property tests (Hypothesis), regression contract tests, E2E integration tests
- Docker image with multi-stage build (builder → slim runtime)
- `docker-compose.yml` for local development with Postgres + the service
- Full `CONTRIBUTING.md` with branch strategy, commit format, and PR checklist
- `CI_CD.md` documenting all GitHub Actions pipeline jobs
- `GUIDE.md` local development guide

[Unreleased]: https://github.com/itkdaniel/nexus-booking/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itkdaniel/nexus-booking/releases/tag/v0.1.0
