# Changelog — nexus-tax

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2024-01-15

### Added
- 80+ federal tax form definitions (1040 family, schedules, informational forms, business returns)
- 51 state tax entries (all 50 states + DC) with income-tax status flags
- FastAPI REST API for form lookup, eligibility checks, and filing guidance
- HMAC-SHA256 JWT authentication with role-based access control
- SQLite in-memory backend for CI tests with zero external dependencies
- Alembic migration baseline for PostgreSQL schema
- Unit tests, BDD scenarios (pytest-bdd), and regression contract tests
- Docker image with multi-stage build
- `docker-compose.yml` for local development
- `CONTRIBUTING.md` with branch strategy and PR process
- `CI_CD.md` documenting pipeline jobs

[Unreleased]: https://github.com/itkdaniel/nexus-tax/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itkdaniel/nexus-tax/releases/tag/v0.1.0
