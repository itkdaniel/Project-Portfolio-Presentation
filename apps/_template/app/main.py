"""
nexus-subapp — FastAPI application factory template.

Copy this entire `apps/_template/` directory to `apps/nexus-<name>/` and
customise. The pattern used here is identical across all NexusConsult sub-apps:

  - Factory function `create_app(settings=None)` for test isolation
  - Lifespan context: DB init → service init → shutdown
  - Standard /health and /info endpoints
  - Versioned routes under /v1/<name>/
  - Normalised error handlers: {error, code, details, request_id}
"""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.database import configure_engine, create_tables, dispose_engine

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ]
)
logger = structlog.get_logger("nexus-subapp")
_start_time = time.monotonic()


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    uptime: float


class InfoResponse(BaseModel):
    name: str
    version: str
    port: int
    description: str
    endpoints: list[dict]


def _make_lifespan(settings: Settings):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting", service=settings.app_name, port=settings.port)
        configure_engine(settings)
        await create_tables()
        yield
        await dispose_engine()
        logger.info("Shut down cleanly", service=settings.app_name)
    return lifespan


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    cfg = settings or get_settings()
    app = FastAPI(
        title=cfg.app_name,
        version=cfg.version,
        description="NexusConsult sub-app — fill in the description.",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=_make_lifespan(cfg),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=HealthResponse, tags=["meta"])
    async def health():
        return HealthResponse(
            status="ok",
            service=cfg.app_name,
            version=cfg.version,
            uptime=round(time.monotonic() - _start_time, 2),
        )

    @app.get("/info", response_model=InfoResponse, tags=["meta"])
    async def info():
        return InfoResponse(
            name=cfg.app_name,
            version=cfg.version,
            port=cfg.port,
            description="Describe your sub-app here.",
            endpoints=[
                {"method": "GET", "path": "/health", "auth": False, "description": "Health check"},
                {"method": "GET", "path": "/info",   "auth": False, "description": "Service metadata"},
            ],
        )

    # ── Add your routers here ─────────────────────────────────────────────────
    # from app.routers.example import router as example_router
    # app.include_router(example_router)

    @app.exception_handler(StarletteHTTPException)
    async def http_exc_handler(request: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail:
            content = {**detail, "request_id": detail.get("request_id", str(uuid.uuid4()))}
        else:
            content = {"error": str(detail) or "HTTP error", "code": f"HTTP_{exc.status_code}", "details": {}, "request_id": str(uuid.uuid4())}
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(RequestValidationError)
    async def validation_exc_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"error": "Request validation failed", "code": "VALIDATION_ERROR", "details": {"errors": exc.errors()}, "request_id": str(uuid.uuid4())})

    @app.exception_handler(Exception)
    async def global_exc_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception", path=str(request.url), error=str(exc))
        return JSONResponse(status_code=500, content={"error": "Internal server error", "code": "INTERNAL_ERROR", "details": {}, "request_id": str(uuid.uuid4())})

    return app


app = create_app()
