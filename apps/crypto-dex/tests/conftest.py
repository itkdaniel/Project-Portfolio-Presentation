import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import create_app
from app.config import Settings
from app.database import Base, get_db_dep

# Use SQLite in-memory for testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(name="test_settings")
def fixture_test_settings():
    return Settings(
        app_name="crypto-dex-test",
        database_url=TEST_DATABASE_URL,
        debug=True
    )

@pytest.fixture(name="engine")
async def fixture_engine(test_settings):
    engine = create_async_engine(
        test_settings.database_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest.fixture(name="db_session")
async def fixture_db_session(engine):
    connection = await engine.connect()
    transaction = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    session = session_factory()

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()

@pytest.fixture(name="client")
async def fixture_client(test_settings, db_session):
    app = create_app(test_settings)
    
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db_dep] = override_get_db
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
