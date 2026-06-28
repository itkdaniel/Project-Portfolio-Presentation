# Changelog — nexus-graph

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2024-01-15

### Added
- Knowledge graph engine backed by python-igraph for entity relationship modelling
- FastAPI REST API with CRUD endpoints for nodes and edges
- BFS traversal endpoint for multi-hop entity lookups
- React-based graph explorer UI with force-directed layout (served from `frontend/`)
- Async SQLAlchemy + asyncpg data layer with Alembic migration baseline
- HMAC-SHA256 JWT authentication with role-based access control
- SQLite in-memory backend for CI tests with zero external dependencies
- Unit tests, BDD scenarios (pytest-bdd), and regression contract tests
- Docker image with multi-stage build (Python backend + Node frontend build)
- `pyproject.toml` with PEP 517 build system and optional dev dependencies

[Unreleased]: https://github.com/itkdaniel/nexus-graph/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itkdaniel/nexus-graph/releases/tag/v0.1.0
