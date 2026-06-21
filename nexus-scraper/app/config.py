"""
Application configuration for NexusScraper.
Reads from environment variables with sensible defaults.
"""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "NexusScraper"
    version: str = "1.0.0"
    debug: bool = False
    port: int = 8005

    database_url: str = "postgresql+asyncpg://nexus:nexuspassword@localhost:5432/nexusdb"

    nexus_ai_url: str = "http://localhost:8001"

    tor_socks5_host: str = "127.0.0.1"
    tor_socks5_port: int = 9050

    scrape_timeout_s: int = 15
    scrape_max_content_bytes: int = 1_000_000

    trending_interval_hours: int = 6
    trending_hn_count: int = 30
    trending_reddit_count: int = 20

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
