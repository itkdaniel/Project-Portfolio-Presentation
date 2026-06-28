"""
crypto-analytics — Portfolio Analytics Microservice.

Endpoints:
  GET  /health                          — liveness probe
  GET  /info                            — service metadata
  POST /v1/analytics/quantum/optimize   — QAOA portfolio optimization
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.routers.quantum import router as quantum_router

_START_TIME = time.monotonic()

APP_NAME = "crypto-analytics"
VERSION = "1.0.0"
PORT = 8104


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


def create_app() -> FastAPI:
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
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(quantum_router)

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
                {"method": "GET",  "path": "/health",                       "auth": False, "description": "Health check"},
                {"method": "GET",  "path": "/info",                         "auth": False, "description": "Service metadata"},
                {"method": "POST", "path": "/v1/analytics/quantum/optimize","auth": False, "description": "QAOA portfolio optimization"},
                {"method": "GET",  "path": "/openapi.json",                 "auth": False, "description": "OpenAPI spec"},
            ],
        })

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        from app.routers.quantum import get_backend as _qb
        detail = exc.detail
        err_msg = detail.get("error", str(detail)) if isinstance(detail, dict) else str(detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": err_msg, "fallback_used": _qb().fallback_used},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        from app.routers.quantum import get_backend as _qb
        first_msg = exc.errors()[0].get("msg", "Validation error") if exc.errors() else "Validation error"
        return JSONResponse(
            status_code=422,
            content={"error": str(first_msg), "fallback_used": _qb().fallback_used},
        )

    @app.exception_handler(Exception)
    async def global_handler(request: Request, exc: Exception):
        import uuid
        from app.routers.quantum import get_backend as _qb
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "fallback_used": _qb().fallback_used,
                "request_id": str(uuid.uuid4()),
            },
        )

    return app


app = create_app()
