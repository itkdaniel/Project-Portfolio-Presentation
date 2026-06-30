"""
Application configuration for crypto-market.
"""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "crypto-market"
    version: str = "0.1.0"
    port: int = 8101
    debug: bool = False

    database_url: str = "postgresql+asyncpg://nexus:nexuspassword@postgres:5432/cryptomarket"
    cors_origins: list[str] = ["*"]
    portfolio_url: str = "http://localhost:5000"

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
