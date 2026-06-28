# Changelog — nexus-scraper

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2024-01-15

### Added
- Async web scraper with configurable depth, rate limiting, and SOCKS proxy support
- APScheduler-based job queue for scrape task scheduling and retry logic
- Entity extraction pipeline — parses and persists structured data from scraped HTML
- FastAPI REST API for submitting scrape jobs, polling status, and retrieving results
- Async SQLAlchemy + asyncpg data layer with Alembic migration baseline
- HMAC-SHA256 JWT authentication with role-based access control
- SQLite in-memory backend for CI tests with zero external dependencies
- Unit tests and regression contract tests
- Docker image with multi-stage build
- `pyproject.toml` with PEP 517 build system and optional dev dependencies

[Unreleased]: https://github.com/itkdaniel/nexus-scraper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itkdaniel/nexus-scraper/releases/tag/v0.1.0
