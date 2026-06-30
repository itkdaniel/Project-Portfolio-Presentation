from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.database import configure_engine, create_tables, dispose_engine, get_db
from app.seed import seed_db

# Routers
from app.routers.auth import router as auth_router
from app.routers.coins import router as coins_router
from app.routers.portfolio import router as portfolio_router
from app.routers.watchlist import router as watchlist_router

try:
    from nexus_shared.logging_config import configure_logging, get_logger
    configure_logging("nexus-crypto", log_file="logs/nexus-crypto.jsonl")
except ImportError:
    import structlog
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )
    get_logger = structlog.get_logger

logger = get_logger("nexus-crypto")
_start_time = time.monotonic()


def _make_lifespan(settings: Settings):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting", service=settings.app_name, port=settings.port)
        configure_engine(settings)
        await create_tables()
        
        async with get_db() as session:
            await seed_db(session)
            
        yield
        await dispose_engine()
        logger.info("Shut down cleanly", service=settings.app_name)
    return lifespan


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    cfg = settings or get_settings()
    app = FastAPI(
        title=cfg.app_name,
        version=cfg.version,
        description="Nexus Crypto Portal — Portfolio and Asset Management",
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

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response

    @app.get("/health", tags=["meta"])
    async def health():
        return {
            "status": "ok",
            "service": cfg.app_name,
            "version": cfg.version,
            "uptime": round(time.monotonic() - _start_time, 2),
        }

    @app.get("/info", tags=["meta"])
    async def info():
        return {
            "name": cfg.app_name,
            "version": cfg.version,
            "port": cfg.port,
            "description": "Nexus Crypto Portal for portfolio tracking and watchlists.",
            "endpoints": [
                {"method": "POST", "path": "/v1/crypto/auth/register", "auth": False},
                {"method": "POST", "path": "/v1/crypto/auth/login", "auth": False},
                {"method": "GET", "path": "/v1/crypto/auth/me", "auth": True},
                {"method": "GET", "path": "/v1/crypto/coins", "auth": False},
                {"method": "GET", "path": "/v1/crypto/portfolio", "auth": True},
                {"method": "GET", "path": "/v1/crypto/watchlist", "auth": True},
            ],
        }

    # Include Routers
    app.include_router(auth_router, prefix="/v1/crypto/auth", tags=["auth"])
    app.include_router(coins_router, prefix="/v1/crypto", tags=["market"])
    app.include_router(portfolio_router, prefix="/v1/crypto/portfolio", tags=["portfolio"])
    app.include_router(watchlist_router, prefix="/v1/crypto/watchlist", tags=["watchlist"])

    @app.exception_handler(StarletteHTTPException)
    async def http_exc_handler(request: Request, exc: StarletteHTTPException):
        rid = getattr(request.state, "request_id", str(uuid.uuid4()))
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail), "code": f"HTTP_{exc.status_code}", "details": {}, "request_id": rid}
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exc_handler(request: Request, exc: RequestValidationError):
        rid = getattr(request.state, "request_id", str(uuid.uuid4()))
        return JSONResponse(
            status_code=422,
            content={"error": "Validation failed", "code": "VALIDATION_ERROR", "details": {"errors": exc.errors()}, "request_id": rid}
        )

    @app.exception_handler(Exception)
    async def global_exc_handler(request: Request, exc: Exception):
        rid = getattr(request.state, "request_id", str(uuid.uuid4()))
        logger.error("Unhandled exception", error=str(exc), path=str(request.url))
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "code": "INTERNAL_ERROR", "details": {}, "request_id": rid}
        )

    return app

app = create_app()
