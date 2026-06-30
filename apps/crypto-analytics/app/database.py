"""
Async database layer — SQLAlchemy 2.x async engine.

Drivers:
  Production: asyncpg (PostgreSQL)
  Tests:      aiosqlite (SQLite in-memory)
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

_engine: Optional[AsyncEngine] = None
_session_factory = None


class Base(DeclarativeBase):
    pass


def configure_engine(settings) -> None:
    global _engine, _session_factory
    kwargs: dict = {"echo": settings.debug}
    url = settings.database_url
    if not url.startswith("sqlite"):
        kwargs.update({"pool_size": 2, "max_overflow": 8, "pool_pre_ping": True})
    _engine = create_async_engine(url, **kwargs)
    _session_factory = async_sessionmaker(
        _engine, class_=AsyncSession, expire_on_commit=False
    )


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        from app.config import get_settings
        configure_engine(get_settings())
    return _engine


def get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _session_factory


@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db_dep() -> AsyncGenerator[AsyncSession, None]:
    async with get_db() as session:
        yield session


async def create_tables() -> None:
    from app.models import PortfolioSnapshotModel, AssetSnapshotModel  # noqa: F401
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
