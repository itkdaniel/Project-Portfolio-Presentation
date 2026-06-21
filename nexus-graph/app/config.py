from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    version: str = "1.0.0"
    port: int = 8006
    debug: bool = False

    database_url: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/nexus")

    # Cluster cache TTL in seconds (10 minutes)
    cluster_cache_ttl: int = 600

    cors_origins: list[str] = ["*"]

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def async_db_url(self) -> str:
        url = self.database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
