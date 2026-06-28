"""
Application configuration — reads from environment variables.
Copy and customise this file for your new sub-app.
"""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "nexus-subapp"
    version: str = "1.0.0"
    port: int = 9000
    debug: bool = False

    database_url: str = "postgresql+asyncpg://nexus:nexuspassword@localhost:5432/nexussubapp"
    cors_origins: list[str] = ["*"]
    portfolio_url: str = "http://localhost:5000"

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
