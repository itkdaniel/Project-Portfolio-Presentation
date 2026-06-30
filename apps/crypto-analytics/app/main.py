"""
crypto-analytics — Portfolio Analytics Microservice (v0.2.0).

Endpoints:
  GET  /health                               — liveness probe
  GET  /info                                 — service metadata
  POST /v1/analytics/quantum/optimize        — QAOA portfolio optimization
  POST /v1/analytics/portfolio/snapshot      — record portfolio snapshot
  GET  /v1/analytics/portfolio/snapshots     — list historical snapshots
  GET  /v1/analytics/portfolio/timeseries    — timeseries for charting
  GET  /v1/analytics/portfolio/performance   — Sharpe, drawdown, volatility
  GET  /v1/analytics/portfolio/breakdown     — per-asset P&L breakdown
"""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.routers.quantum import router as quantum_router
from app.routers.snapshots import router as snapshots_router
from app.routers.performance import router as performance_router

try:
    from nexus_shared.logging_config import configure_logging, get_logger
    configure_logging("crypto-analytics", log_file="logs/crypto-analytics.jsonl")
except ImportError:
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )
    get_logger = structlog.get_logger

logger = get_logger("crypto-analytics")

_START_TIME = time.monotonic()

APP_NAME = "crypto-analytics"
VERSION = "0.2.0"
PORT = 8104


def _make_lifespan(settings: Settings):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting crypto-analytics", port=settings.port, version=VERSION)
        from app.database import configure_engine, create_tables
        configure_engine(settings)
        await create_tables()
        logger.info("crypto-analytics ready")
        yield
        from app.database import dispose_engine
        await dispose_engine()
        logger.info("crypto-analytics shutdown complete")
    return lifespan


def create_app(settings: Settings | None = None) -> FastAPI:
    if settings is None:
        settings = get_settings()

    app = FastAPI(
        title=APP_NAME,
        version=VERSION,
        description=(
            "Portfolio analytics microservice — P&L attribution, rolling Sharpe ratio, "
            "drawdown analysis, asset correlation, and quantum portfolio optimization."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=_make_lifespan(settings),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(quantum_router)
    app.include_router(snapshots_router)
    app.include_router(performance_router)

    @app.get("/health", tags=["meta"])
    async def health():
        return JSONResponse({
            "status": "ok",
            "service": APP_NAME,
            "version": VERSION,
            "uptime_seconds": round(time.monotonic() - _START_TIME, 2),
        })

    @app.get("/info", tags=["meta"])
    async def info():
        return JSONResponse({
            "name": APP_NAME,
            "version": VERSION,
            "port": PORT,
            "endpoints": [
                {"method": "GET",  "path": "/health",                               "auth": False, "description": "Health check"},
                {"method": "GET",  "path": "/info",                                 "auth": False, "description": "Service metadata"},
                {"method": "POST", "path": "/v1/analytics/quantum/optimize",        "auth": False, "description": "QAOA portfolio optimization"},
                {"method": "POST", "path": "/v1/analytics/portfolio/snapshot",      "auth": False, "description": "Record portfolio snapshot"},
                {"method": "GET",  "path": "/v1/analytics/portfolio/snapshots",     "auth": False, "description": "List historical snapshots"},
                {"method": "GET",  "path": "/v1/analytics/portfolio/timeseries",    "auth": False, "description": "Timeseries for charting"},
                {"method": "GET",  "path": "/v1/analytics/portfolio/performance",   "auth": False, "description": "Sharpe, drawdown, volatility"},
                {"method": "GET",  "path": "/v1/analytics/portfolio/breakdown",     "auth": False, "description": "Per-asset P&L breakdown"},
                {"method": "GET",  "path": "/openapi.json",                         "auth": False, "description": "OpenAPI spec"},
            ],
        })

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        detail = exc.detail
        err_msg = detail.get("error", str(detail)) if isinstance(detail, dict) else str(detail)
        return JSONResponse(status_code=exc.status_code, content={"error": err_msg})

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        first_msg = exc.errors()[0].get("msg", "Validation error") if exc.errors() else "Validation error"
        return JSONResponse(status_code=422, content={"error": str(first_msg)})

    @app.exception_handler(Exception)
    async def global_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception", exc=str(exc))
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "request_id": str(uuid.uuid4())},
        )

    return app


app = create_app()
