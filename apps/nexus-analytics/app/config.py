"""
Application configuration for nexus-analytics.
All values can be overridden via environment variables or a .env file.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Service identity ──────────────────────────────────────────────────────
    app_name: str = "nexus-analytics"
    version: str = "0.1.0"
    port: int = 8300
    debug: bool = False

    # ── Database ──────────────────────────────────────────────────────────────
    # Defaults to a local SQLite DB for development; set to a real DSN in prod.
    database_url: str = "sqlite+aiosqlite:///./nexus_analytics.db"

    # ── Retention ─────────────────────────────────────────────────────────────
    # Events older than this many days are pruned on startup (0 = no pruning).
    retention_days: int = 90

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: str = "INFO"
    log_file: str = "logs/nexus-analytics.jsonl"

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["*"]

    # ── Portfolio gateway ─────────────────────────────────────────────────────
    portfolio_url: str = "http://localhost:5000"

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached singleton — created once, shared across all requests."""
    return Settings()
