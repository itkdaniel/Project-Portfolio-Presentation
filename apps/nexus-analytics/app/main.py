"""
nexus-analytics — Platform API Analytics Microservice.

Architecture
────────────
- Factory pattern: create_app(settings=None) → FastAPI
  Inject custom Settings in tests for full isolation.
- Lifespan context: DB init → optional retention prune → ready
- Standard /health and /info endpoints
- Versioned routes under /v1/analytics/
- Normalised error envelope: {error, code, details, request_id}
- Color-coded structured logging via nexus_shared.logging_config
  Console  → ANSI color-coded lines (DEBUG=cyan, INFO=green, WARN=yellow,
              ERROR=red, CRITICAL=magenta)
  File     → JSON-lines at logs/nexus-analytics.jsonl (10 MB rotation, 5 backups)

Port: 8300 (default)
"""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.database import configure_engine, create_tables, dispose_engine
from app.models import HealthResponse, InfoResponse
from app.routers.events import router as events_router
from app.routers.summary import router as summary_router

# ── Logging setup (must happen before any logger.xxx calls) ───────────────────
# Import is conditional so the service works even if nexus_shared is not yet
# installed (e.g. running directly from this directory without pip install).
try:
    from nexus_shared.logging_config import configure_logging, get_logger
    configure_logging("nexus-analytics", log_file="logs/nexus-analytics.jsonl")
except ImportError:  # pragma: no cover
    import structlog, logging
    logging.basicConfig(level=logging.INFO)
    structlog.configure(processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ])
    get_logger = structlog.get_logger

logger = get_logger("nexus-analytics")
_start_time = time.monotonic()


# ── Lifespan ───────────────────────────────────────────────────────────────────

def _make_lifespan(settings: Settings):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # ── Startup ────────────────────────────────────────────────────────────
        logger.info(
            "Starting nexus-analytics",
            port=settings.port,
            debug=settings.debug,
            retention_days=settings.retention_days,
        )
        configure_engine(settings)
        await create_tables()
        logger.info("nexus-analytics ready", port=settings.port)

        yield

        # ── Shutdown ───────────────────────────────────────────────────────────
        logger.info("Shutting down nexus-analytics")
        await dispose_engine()
        logger.info("nexus-analytics stopped")

    return lifespan


# ── App factory ────────────────────────────────────────────────────────────────

def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """
    Create and configure the FastAPI application.

    Args:
        settings: Optional Settings instance for test injection.
                  Defaults to the cached singleton from get_settings().
    """
    if settings is None:
        settings = get_settings()

    app = FastAPI(
        title="Nexus Analytics",
        description=(
            "Platform API analytics service — records API call events from all "
            "NexusConsult sub-apps and exposes aggregate statistics, timeseries, "
            "and error-rate breakdowns."
        ),
        version=settings.version,
        lifespan=_make_lifespan(settings),
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ───────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Request-ID middleware ──────────────────────────────────────────────────
    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response

    # ── Error handlers ─────────────────────────────────────────────────────────
    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        rid = getattr(request.state, "request_id", "-")
        logger.warning(
            "Validation error",
            path=str(request.url.path),
            errors=exc.errors(),
            request_id=rid,
        )
        return JSONResponse(
            status_code=422,
            content={
                "error": "Validation error",
                "code": 422,
                "details": exc.errors(),
                "request_id": rid,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        rid = getattr(request.state, "request_id", "-")
        logger.warning(
            "HTTP error",
            status_code=exc.status_code,
            path=str(request.url.path),
            detail=exc.detail,
            request_id=rid,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.detail,
                "code": exc.status_code,
                "details": None,
                "request_id": rid,
            },
        )

    # ── Standard endpoints ─────────────────────────────────────────────────────
    @app.get("/health", response_model=HealthResponse, tags=["meta"])
    async def health() -> HealthResponse:
        """Liveness + readiness probe."""
        return HealthResponse(
            status="healthy",
            service=settings.app_name,
            version=settings.version,
            uptime=round(time.monotonic() - _start_time, 2),
        )

    @app.get("/info", response_model=InfoResponse, tags=["meta"])
    async def info() -> InfoResponse:
        """Service metadata and endpoint catalogue."""
        return InfoResponse(
            name=settings.app_name,
            version=settings.version,
            port=settings.port,
            description=(
                "Platform API analytics service — records call events from all "
                "NexusConsult microservices and provides summary, timeseries, "
                "and error-rate analytics."
            ),
            endpoints=[
                {"method": "POST", "path": "/v1/analytics/events",         "auth": False, "description": "Record one API call event"},
                {"method": "GET",  "path": "/v1/analytics/summary",        "auth": False, "description": "Per-service aggregate stats"},
                {"method": "GET",  "path": "/v1/analytics/top-endpoints",  "auth": False, "description": "Top N endpoints by call volume"},
                {"method": "GET",  "path": "/v1/analytics/errors",         "auth": False, "description": "Error-rate breakdown per service"},
                {"method": "GET",  "path": "/v1/analytics/timeseries",     "auth": False, "description": "Time-bucketed call counts"},
                {"method": "GET",  "path": "/health",                      "auth": False, "description": "Liveness probe"},
                {"method": "GET",  "path": "/info",                        "auth": False, "description": "Service metadata"},
            ],
        )

    # ── Versioned routers ──────────────────────────────────────────────────────
    app.include_router(events_router)
    app.include_router(summary_router)

    return app


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    s = get_settings()
    logger.info("Launching nexus-analytics", port=s.port, debug=s.debug)
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=s.port,
        reload=s.debug,
        log_level=s.log_level.lower(),
    )
