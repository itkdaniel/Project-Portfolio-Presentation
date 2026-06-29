"""
nexus-quantum — FastAPI application factory.

Architecture:
  - Factory pattern: create_app(settings=None) → FastAPI
    Inject custom Settings in tests for full isolation.
  - Lifespan context: DB pool init → Azure service init → shutdown cleanup
  - CORS: configurable via settings.cors_origins
  - Standard endpoints: /health, /info, /docs (OpenAPI)
  - Versioned routes under /v1/quantum/
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
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.database import configure_engine, create_tables, dispose_engine
from app.models import HealthResponse, InfoResponse
from app.routers.circuits import router as circuits_router
from app.routers.jobs import router as jobs_router
from app.routers.optimize import router as optimize_router
from app.routers.simulate import router as simulate_router

try:
    from nexus_shared.logging_config import configure_logging, get_logger
    configure_logging("nexus-quantum", log_file="logs/nexus-quantum.jsonl")
except ImportError:
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )
    get_logger = structlog.get_logger
logger = get_logger("nexus-quantum")

_start_time = time.monotonic()


def _make_lifespan(settings: Settings):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting nexus-quantum", port=settings.port, debug=settings.debug)

        configure_engine(settings)

        # Configure the hot-reload provider so it knows where to find the main app.
        from app.quantum_config_provider import configure_provider
        configure_provider(portfolio_url=settings.portfolio_url)

        # Initial Azure client setup — the provider will refresh from DB on first request.
        from app.services.azure_quantum import get_azure_service
        svc = get_azure_service()

        await create_tables()

        azure_mode = "azure" if svc.is_available else "local_simulation"
        logger.info("nexus-quantum ready", mode=azure_mode)

        yield

        await dispose_engine()
        logger.info("nexus-quantum shut down cleanly")

    return lifespan


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """
    Application factory.

    Pass custom Settings for tests:
        app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    """
    cfg = settings or get_settings()

    app = FastAPI(
        title="nexus-quantum",
        version=cfg.version,
        description=(
            "Azure Quantum microservice for NexusConsult. "
            "Exposes quantum circuit simulation, QAOA/VQE variational algorithms, "
            "and quantum-inspired optimization (portfolio, route, QUBO) via REST API. "
            "Degrades gracefully to local simulation when Azure credentials are absent."
        ),
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
        """Liveness probe — k8s / gateway health check."""
        from app.services.azure_quantum import get_azure_service
        svc = get_azure_service()
        return HealthResponse(
            status="ok",
            service=cfg.app_name,
            version=cfg.version,
            uptime=round(time.monotonic() - _start_time, 2),
            azure_connected=svc.is_available,
        )

    @app.get("/info", response_model=InfoResponse, tags=["meta"])
    async def info():
        """Service metadata — consumed by the main portfolio gateway."""
        return InfoResponse(
            name=cfg.app_name,
            version=cfg.version,
            port=cfg.port,
            description=(
                "Azure Quantum microservice with job management, circuit simulation, "
                "and quantum-inspired optimization"
            ),
            endpoints=[
                {"method": "GET",    "path": "/health",                          "auth": False, "description": "Health check"},
                {"method": "GET",    "path": "/info",                            "auth": False, "description": "Service metadata"},
                {"method": "POST",   "path": "/v1/quantum/jobs",                 "auth": False, "description": "Submit a quantum job"},
                {"method": "GET",    "path": "/v1/quantum/jobs",                 "auth": False, "description": "List submitted jobs"},
                {"method": "GET",    "path": "/v1/quantum/jobs/{job_id}",        "auth": False, "description": "Poll job status"},
                {"method": "DELETE", "path": "/v1/quantum/jobs/{job_id}",        "auth": False, "description": "Cancel a pending job"},
                {"method": "POST",   "path": "/v1/quantum/simulate",             "auth": False, "description": "Simulate a quantum circuit"},
                {"method": "GET",    "path": "/v1/quantum/simulate/backends",    "auth": False, "description": "List available simulators"},
                {"method": "POST",   "path": "/v1/quantum/optimize/portfolio",   "auth": False, "description": "Portfolio optimization (QAOA)"},
                {"method": "POST",   "path": "/v1/quantum/optimize/route",       "auth": False, "description": "Route optimization (quantum annealing)"},
                {"method": "POST",   "path": "/v1/quantum/optimize/constraint",  "auth": False, "description": "QUBO constraint solver"},
                {"method": "GET",    "path": "/v1/quantum/optimize/algorithms",  "auth": False, "description": "List available algorithms"},
                {"method": "POST",   "path": "/v1/quantum/circuits",             "auth": False, "description": "Save a circuit definition"},
                {"method": "GET",    "path": "/v1/quantum/circuits",             "auth": False, "description": "List saved circuits"},
                {"method": "GET",    "path": "/v1/quantum/circuits/{id}",        "auth": False, "description": "Retrieve a circuit definition"},
                {"method": "POST",   "path": "/v1/quantum/config/reload",         "auth": False, "description": "Invalidate credential cache (hot-reload)"},
            ],
        )

    app.include_router(jobs_router)
    app.include_router(simulate_router)
    app.include_router(optimize_router)
    app.include_router(circuits_router)

    @app.post("/v1/quantum/config/reload", tags=["meta"])
    async def reload_config():
        """
        Invalidate the hot-reload credential cache immediately.

        The nexus-quantum service normally refreshes Azure credentials from the
        DB-backed API every 30 s.  Calling this endpoint forces a fresh fetch on
        the very next request — useful after an admin saves new credentials in the
        Settings UI so changes take effect without waiting for the TTL.
        """
        from app.quantum_config_provider import invalidate_cache
        from app.services.azure_quantum import get_azure_service
        invalidate_cache()
        svc = get_azure_service()
        return {
            "status": "ok",
            "azure_connected": svc.is_available,
            "message": "Credential cache invalidated; new config active.",
        }

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail and "code" in detail:
            content = {
                "error": detail.get("error", "HTTP error"),
                "code": detail.get("code", f"HTTP_{exc.status_code}"),
                "details": detail.get("details", {}),
                "request_id": detail.get("request_id", str(uuid.uuid4())),
            }
        else:
            content = {
                "error": str(detail) if detail else "HTTP error",
                "code": f"HTTP_{exc.status_code}",
                "details": {},
                "request_id": str(uuid.uuid4()),
            }
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "error": "Request validation failed",
                "code": "VALIDATION_ERROR",
                "details": {"errors": exc.errors()},
                "request_id": str(uuid.uuid4()),
            },
        )

    @app.exception_handler(Exception)
    async def global_exc_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception", path=str(request.url), error=str(exc))
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "code": "INTERNAL_ERROR",
                "details": {},
                "request_id": str(uuid.uuid4()),
            },
        )

    return app


app = create_app()
