"""
Shared pytest fixtures for nexus-quantum test suite.

Uses an in-memory SQLite database via aiosqlite with StaticPool so that all
connections — including background-task sessions that call get_db() directly —
share the exact same underlying SQLite connection and therefore the same data.

Fixture hierarchy:
  test_settings — isolated Settings (SQLite in-memory URL)
  client        — async httpx.AsyncClient against the test app
  wait_for_job  — helper coroutine for polling until a job leaves pending/running
"""
from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.database import Base, get_db_dep
import app.database as _db_module
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(autouse=True)
async def reset_azure_globals():
    """Reset Azure service singleton between tests."""
    import app.services.azure_quantum as az_module
    prev = az_module._azure_service
    yield
    az_module._azure_service = prev


@pytest.fixture(scope="function")
def test_settings() -> Settings:
    """Isolated settings pointing to in-memory SQLite."""
    return Settings(
        database_url=TEST_DB_URL,
        port=8200,
        debug=True,
        azure_quantum_workspace_id="",
    )


@pytest_asyncio.fixture(scope="function")
async def client(test_settings):
    """
    httpx.AsyncClient wired to a fresh FastAPI app backed by a StaticPool
    in-memory SQLite engine.

    StaticPool forces every SQLAlchemy session — including those opened by
    the async background task via get_db() — to reuse the same single
    connection, so all callers see the same in-memory database.
    """
    from app.services.azure_quantum import configure_azure

    # Build a single-connection engine shared across all sessions
    engine = create_async_engine(
        TEST_DB_URL,
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Inject this engine into the module-level globals so that get_db()
    # (used by background tasks) also uses the same connection
    prev_engine = _db_module._engine
    prev_factory = _db_module._session_factory

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    _db_module._engine = engine
    _db_module._session_factory = factory

    configure_azure(test_settings)

    async def override_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app_instance = create_app(test_settings)
    app_instance.dependency_overrides[get_db_dep] = override_db

    async with AsyncClient(
        transport=ASGITransport(app=app_instance),
        base_url="http://test",
    ) as ac:
        yield ac

    # Restore module globals
    _db_module._engine = prev_engine
    _db_module._session_factory = prev_factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


async def wait_for_job(
    client: AsyncClient,
    job_id: str,
    *,
    timeout: float = 5.0,
    interval: float = 0.05,
) -> dict:
    """Poll GET /v1/quantum/jobs/{id} until the job leaves pending/running.

    Returns the final job dict. On timeout returns whatever the last poll
    returned (may still be pending/running).
    """
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        resp = await client.get(f"/v1/quantum/jobs/{job_id}")
        data = resp.json()
        if data.get("status") not in ("pending", "running"):
            return data
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            return data
        await asyncio.sleep(interval)
