"""Application configuration via pydantic-settings."""

from enum import Enum
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class StorageBackend(str, Enum):
    local = "local"
    s3    = "s3"
    gcs   = "gcs"
    azure = "azure"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    # Database
    database_url: str = Field(..., description="PostgreSQL connection string")
    redis_url: str    = Field("redis://localhost:6379/0")

    # Storage
    storage_backend: StorageBackend = StorageBackend.local
    storage_local_path: str  = "/tmp/docuflow/uploads"
    s3_bucket: str           = ""
    aws_region: str          = "us-east-1"

    # Processing
    max_file_size_mb: int     = 50
    worker_concurrency: int   = 4
    ocr_language: str         = "eng"
    embedding_model: str      = "all-MiniLM-L6-v2"
    webhook_timeout_s: int    = 10

    # API
    port: int                = 8000
    debug: bool              = False
    log_level: str           = "INFO"
    cors_origins: List[str]  = ["*"]

    @field_validator("max_file_size_mb")
    @classmethod
    def validate_file_size(cls, v: int) -> int:
        if v < 1 or v > 500:
            raise ValueError("max_file_size_mb must be between 1 and 500")
        return v


settings = Settings()
