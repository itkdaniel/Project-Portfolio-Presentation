# Changelog — nexus-crypto (crypto-analytics)

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.2.0] — 2026-06-30

### Added
- **Portfolio analytics engine** (`app/engine.py`): pure-Python financial math — `calc_returns`, `calc_sharpe` (annualised, configurable risk-free rate), `calc_max_drawdown` (peak-to-trough %), `calc_volatility` (annualised std dev %), `calc_portfolio_return`, `compute_snapshot_metrics`
- **Database layer** (`app/database.py`): SQLAlchemy 2.x async engine with asyncpg for production and aiosqlite for tests; `configure_engine`, `get_session_factory`, `get_db` context manager, `create_tables`, `dispose_engine`
- **ORM models** (`app/models.py`): `PortfolioSnapshotModel` (user_id, portfolio_id, total_value_usd, cost_basis, P&L, Sharpe, drawdown, volatility) + `AssetSnapshotModel` (coin_symbol, qty, price, value, cost_basis, P&L, weight_pct)
- **Snapshots router** (`app/routers/snapshots.py`): `POST /v1/analytics/portfolio/snapshot` (record + compute metrics), `GET /v1/analytics/portfolio/snapshots` (paginated list), `GET /v1/analytics/portfolio/timeseries` (date/value/pnl/cost_basis arrays for charting)
- **Performance router** (`app/routers/performance.py`): `GET /v1/analytics/portfolio/performance` (Sharpe, max drawdown, volatility, total return, snapshot count), `GET /v1/analytics/portfolio/breakdown` (per-asset P&L with weight_pct)
- **Updated main.py** to v0.2.0 — lifespan now calls `configure_engine` + `create_tables`; snapshots + performance routers mounted
- **Unit tests** (`tests/unit/test_portfolio.py`): 14 tests covering engine math functions (returns, Sharpe, drawdown, volatility, portfolio return, compute_snapshot_metrics)
- **E2E tests** (`tests/e2e/test_portfolio_flow.py`): 12 tests covering full snapshot record → timeseries → performance → breakdown API flow with aiosqlite in-memory DB
- **Updated conftest.py**: `test_app` fixture via `create_app(Settings)`, `client` fixture with `AsyncClient` + `ASGITransport`, `db_session` fixture

### Changed
- `pyproject.toml`: added `sqlalchemy>=2.0`, `aiosqlite` (dev), `pytest-asyncio`, `httpx` to dependencies
- Service version bumped from `0.1.0` to `0.2.0`

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
