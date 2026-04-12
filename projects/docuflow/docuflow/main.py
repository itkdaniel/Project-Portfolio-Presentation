"""
DocuFlow — Async Document Processing Pipeline
FastAPI application entry point.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from docuflow.core.config import settings
from docuflow.core.database import engine
from docuflow.core.logging import setup_logging
from docuflow.routers import documents, search, health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan — startup and shutdown."""
    setup_logging(settings.log_level)
    yield
    await engine.dispose()


app = FastAPI(
    title="DocuFlow",
    description=(
        "Async document processing pipeline with OCR, structured extraction, "
        "and vector indexing."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Middleware ─────────────────────────────────────────────────────────────

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# ── Routers ────────────────────────────────────────────────────────────────

app.include_router(health.router, tags=["health"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(search.router, prefix="/search", tags=["search"])
