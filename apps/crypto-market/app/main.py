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
from app.database import configure_engine, create_tables, dispose_engine, get_db
from app.seed import seed_db

try:
    from nexus_shared.logging_config import configure_logging, get_logger
    configure_logging("crypto-market", log_file="logs/crypto-market.jsonl")
except ImportError:
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )
    get_logger = structlog.get_logger
logger = get_logger("crypto-market")
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
        
        # Seed the database
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
        description="NexusConsult Crypto Market Data Service",
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
            description="Real-time cryptocurrency market data service.",
            endpoints=[
                {"method": "GET", "path": "/health", "auth": False, "description": "Health check"},
                {"method": "GET", "path": "/info",   "auth": False, "description": "Service metadata"},
                {"method": "GET", "path": "/v1/market/coins", "auth": False, "description": "List all active coins"},
                {"method": "GET", "path": "/v1/market/prices", "auth": False, "description": "Latest price tick per coin"},
                {"method": "GET", "path": "/v1/market/exchanges", "auth": False, "description": "List all exchanges"},
            ],
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    from app.routers.coins import router as coins_router
    from app.routers.prices import router as prices_router
    from app.routers.candles import router as candles_router
    from app.routers.exchanges import router as exchanges_router
    
    app.include_router(coins_router)
    app.include_router(prices_router)
    app.include_router(candles_router)
    app.include_router(exchanges_router)

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
