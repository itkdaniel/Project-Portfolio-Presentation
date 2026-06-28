# Changelog — nexus-search

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2024-01-15

### Added
- BM25 full-text search with persistent inverted index (O(n) build, O(k) queries)
- Levenshtein edit-distance fuzzy fallback when BM25 returns no results
- BFS tag-graph recommendation engine for finding related projects by shared tags
- Jaccard tag-overlap ranking for scoring project similarity
- FastAPI REST API with endpoints for search, fuzzy search, related projects, and tag filtering
- HMAC-SHA256 JWT authentication with role-based access control
- SQLite in-memory backend for CI tests with zero external dependencies
- Alembic migration baseline for PostgreSQL schema
- Unit tests, BDD scenarios (pytest-bdd), DDT parameterised tests, and regression contract tests
- Docker image with multi-stage build
- `docker-compose.yml` for local development
- `CONTRIBUTING.md` with branch strategy and PR process

[Unreleased]: https://github.com/itkdaniel/nexus-search/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itkdaniel/nexus-search/releases/tag/v0.1.0
