"""
Shared test fixtures for crypto-analytics.
Uses aiosqlite in-memory database for full isolation.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.database import configure_engine, dispose_engine, get_session_factory
from app.main import create_app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


def make_test_settings() -> Settings:
    return Settings(
        app_name="crypto-analytics-test",
        port=8104,
        debug=True,
        database_url=TEST_DB_URL,
    )


@pytest_asyncio.fixture
async def test_app():
    settings = make_test_settings()
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        yield app


@pytest_asyncio.fixture
async def client(test_app):
    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://test"
    ) as c:
        yield c


@pytest_asyncio.fixture
async def db_session(test_app):
    factory = get_session_factory()
    async with factory() as session:
        yield session
