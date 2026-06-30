"""
Application configuration for crypto-analytics.
Reads from environment variables with pydantic-settings.
"""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "crypto-analytics"
    version: str = "0.2.0"
    port: int = 8104
    debug: bool = False

    database_url: str = (
        "postgresql+asyncpg://nexus:nexuspassword@postgres:5432/cryptoanalytics"
    )

    portfolio_url: str = "http://localhost:5000"
    nexus_crypto_url: str = "http://nexus-crypto:8100"
    cors_origins: list[str] = ["*"]

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
