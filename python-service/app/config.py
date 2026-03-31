"""
Application configuration — reads from environment variables.
Uses pydantic-settings for type-safe, validated config.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "NexusConsult Python API"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://nexus:nexuspassword@localhost:5432/nexusdb"

    # MongoDB
    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "nexus_docs"

    # Redis
    redis_url: str = "redis://localhost:6379"
    redis_ttl: int = 300  # seconds

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """Cached singleton settings — only created once."""
    return Settings()