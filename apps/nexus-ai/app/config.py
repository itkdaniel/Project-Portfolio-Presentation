"""
NexusAI configuration — reads from environment variables.
Uses pydantic-settings for type-safe, validated config.
Injectable: pass a Settings instance to create_app() for test isolation.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "NexusAI Service"
    version: str = "1.0.0"
    debug: bool = False

    # Inference
    device: str = "auto"
    model_checkpoint: str = ""
    max_seq_len: int = 256
    embed_cache_ttl: int = 1800
    batch_drain_ms: float = 10.0
    max_batch_size: int = 32

    # Intent labels
    intent_labels: list[str] = [
        "microservices_inquiry",
        "devops_inquiry",
        "ai_ml_inquiry",
        "pricing_inquiry",
        "general_support",
    ]

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Server
    port: int = 8001

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """Cached singleton settings — only created once per process."""
    return Settings()
