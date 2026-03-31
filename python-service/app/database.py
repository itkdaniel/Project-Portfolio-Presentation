"""
Async database connections:
  - PostgreSQL via SQLAlchemy 2.0 (async engine + sessions)
  - MongoDB via Motor (async driver)
  - Redis via redis-py (async)

Factory pattern: each connection is created once and shared via FastAPI's
dependency injection system (lifespan context manager).
"""
from __future__ import annotations

import redis.asyncio as aioredis
from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


# ── SQLAlchemy ORM base ───────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Connection factories ──────────────────────────────────────────────────────

def create_pg_engine(database_url: str):
    """
    Creates a connection pool to PostgreSQL.
    pool_pre_ping: validates connections before use (handles stale connections).
    pool_size + max_overflow: controls concurrency capacity.
    """
    return create_async_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        echo=False,
    )


def create_session_factory(engine) -> async_sessionmaker[AsyncSession]:
    """Factory that produces per-request database sessions."""
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def create_mongo_client(mongo_url: str) -> AsyncIOMotorClient:
    """Motor async MongoDB client with connection pooling."""
    return AsyncIOMotorClient(mongo_url, maxPoolSize=10)


def create_redis_client(redis_url: str) -> aioredis.Redis:
    """
    Async Redis client with connection pooling.
    decode_responses=True: returns str instead of bytes.
    """
    return aioredis.from_url(redis_url, decode_responses=True, max_connections=20)


# ── FastAPI dependency providers ──────────────────────────────────────────────

# Module-level singletons (set during lifespan)
_engine = None
_session_factory = None
_mongo_client = None
_redis_client = None


def init_databases():
    """Called once at startup via lifespan."""
    global _engine, _session_factory, _mongo_client, _redis_client
    settings = get_settings()
    _engine = create_pg_engine(settings.database_url)
    _session_factory = create_session_factory(_engine)
    _mongo_client = create_mongo_client(settings.mongo_url)
    _redis_client = create_redis_client(settings.redis_url)


async def close_databases():
    """Graceful shutdown — close all connection pools."""
    if _engine:
        await _engine.dispose()
    if _mongo_client:
        _mongo_client.close()
    if _redis_client:
        await _redis_client.aclose()


async def get_db() -> AsyncSession:
    """FastAPI dependency: yields an async DB session per request."""
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_mongo():
    """FastAPI dependency: returns MongoDB database handle."""
    settings = get_settings()
    return _mongo_client[settings.mongo_db]


def get_redis() -> aioredis.Redis:
    """FastAPI dependency: returns shared Redis client."""
    return _redis_client