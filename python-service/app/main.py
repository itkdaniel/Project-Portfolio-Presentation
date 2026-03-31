"""
NexusConsult Python FastAPI Microservice.

Architecture:
  - FastAPI async framework (ASGI via uvicorn)
  - Factory pattern for app creation (enables easy testing with different configs)
  - Lifespan context manager for startup/shutdown of DB pools
  - Structured logging via structlog
  - CORS enabled for cross-service communication
  - Async throughout: no blocking I/O

Services exposed:
  - /v1/projects  — Projects CRUD + BM25 search + graph recommendations
  - /health       — Health check (k8s liveness/readiness)
  - /docs         — Auto-generated OpenAPI UI (Swagger)
"""
from __future__ import annotations

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import init_databases, close_databases
from app.routers.projects import router as projects_router

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context: runs once at startup and shutdown.
    Initializes all connection pools here so they're shared across requests.
    """
    settings = get_settings()
    logger.info("Starting NexusConsult Python Service", env=settings.debug and "dev" or "prod")
    init_databases()
    yield
    logger.info("Shutting down — closing DB connections")
    await close_databases()


def create_app() -> FastAPI:
    """
    Application factory.
    Creates and configures the FastAPI app. Call this in tests to get
    a fresh app instance with isolated configuration.
    """
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description=(
            "Python FastAPI microservice for NexusConsult. "
            "Provides advanced search, caching, and recommendation APIs."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],   # Restrict in production via environment config
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(projects_router)

    # ── Health check ──────────────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "ok", "service": settings.app_name}

    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc):
        logger.error("Unhandled exception", error=str(exc), path=request.url.path)
        return JSONResponse(status_code=500, content={"message": "Internal server error"})

    return app


# Module-level app instance for uvicorn
app = create_app()