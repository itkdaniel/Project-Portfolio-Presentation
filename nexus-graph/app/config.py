from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    version: str = "1.0.0"
    port: int = 8006
    debug: bool = False

    database_url: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/nexus")

    # Bounded graph-read settings. These are intentionally server-controlled:
    # browser query parameters can request less data, never more.
    cluster_cache_ttl: int = 600
    graph_max_search_limit: int = 500
    graph_max_edge_ids: int = 200
    graph_max_subgraph_depth: int = 2
    graph_max_subgraph_degree: int = 40
    graph_max_subgraph_nodes: int = 200
    graph_max_subgraph_edges: int = 400
    graph_display_threshold: int = 80
    graph_cluster_max_nodes: int = 1000
    graph_cluster_max_edges: int = 3000

    cors_origins: list[str] = ["*"]

    # Admin token for protected write endpoints (e.g. POST /v1/graph/relations).
    # Set NEXUS_GRAPH_ADMIN_TOKEN in the environment to enable auth enforcement.
    # When empty (default), auth is not enforced — suitable for local dev only.
    admin_token: str = ""

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
