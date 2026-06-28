"""
Application configuration — reads from environment variables.
Uses pydantic-settings for type-safe, validated config with .env support.
"""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Service identity ──────────────────────────────────────────────────────
    app_name: str = "nexus-quantum"
    version: str = "1.0.0"
    port: int = 8200
    debug: bool = False

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://nexus:nexuspassword@localhost:5432/nexusquantum"

    # ── Azure Quantum (optional — graceful degradation when absent) ───────────
    azure_quantum_subscription_id: str = ""
    azure_quantum_resource_group: str = ""
    azure_quantum_workspace_name: str = ""
    azure_quantum_location: str = "eastus"
    # When set, real Azure Quantum jobs are submitted; otherwise local sim only
    azure_quantum_workspace_id: str = ""

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["*"]

    # ── Portfolio gateway ─────────────────────────────────────────────────────
    portfolio_url: str = "http://localhost:5000"

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached singleton — created once, shared across all requests."""
    return Settings()
