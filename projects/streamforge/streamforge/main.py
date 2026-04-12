"""
StreamForge — Kafka Event Pipeline
FastAPI entry point for the publishing and management API.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from streamforge.core.config import settings
from streamforge.core.database import engine
from streamforge.routers import events, consumers, dlq, health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    yield
    await engine.dispose()


app = FastAPI(
    title="StreamForge",
    description="High-throughput Kafka event pipeline with outbox pattern and DLQ support.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(health.router, tags=["health"])
app.include_router(events.router,    prefix="/events",    tags=["events"])
app.include_router(consumers.router, prefix="/consumers", tags=["consumers"])
app.include_router(dlq.router,       prefix="/dlq",       tags=["dlq"])
