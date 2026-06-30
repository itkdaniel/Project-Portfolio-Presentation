from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database import Base, get_db_dep
from app.config import Settings, get_settings
from app.main import create_app

@pytest.fixture
def test_settings():
    return Settings(
        app_name="nexus-crypto-test",
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret="test-secret",
        debug=True
    )

@pytest_asyncio.fixture
async def test_db(test_settings):
    engine = create_async_engine(test_settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    SessionFactory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionFactory() as session:
        yield session
    
    await engine.dispose()

@pytest_asyncio.fixture
async def client(test_settings, test_db):
    app = create_app(test_settings)
    
    async def get_test_db():
        yield test_db
        
    app.dependency_overrides[get_db_dep] = get_test_db
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
