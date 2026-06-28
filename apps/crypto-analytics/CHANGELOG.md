# Changelog — nexus-crypto (crypto-analytics)

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2024-01-15

### Added
- Portfolio analytics REST API for crypto asset tracking and performance metrics
- Liveness probe (`GET /health`) and service metadata (`GET /info`) endpoints
- Pydantic v2 request/response schemas with strict validation
- FastAPI application with structured JSON logging via structlog
- HMAC-SHA256 JWT authentication with role-based access control
- `pyproject.toml` with PEP 517 build system and optional dev dependencies
- Unit tests and BDD scenarios (pytest-bdd) with SQLite in-memory backend
- Docker image with multi-stage build
- `CONTRIBUTING.md` with branch strategy and PR process

[Unreleased]: https://github.com/itkdaniel/nexus-crypto/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itkdaniel/nexus-crypto/releases/tag/v0.1.0
