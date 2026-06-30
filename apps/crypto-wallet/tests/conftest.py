import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from typing import AsyncGenerator

from app.main import create_app
from app.config import Settings
from app.database import Base, configure_engine, dispose_engine, get_db_dep

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture
async def test_settings():
    return Settings(
        app_name="crypto-wallet-test",
        database_url=TEST_DATABASE_URL,
        debug=True
    )

@pytest.fixture
async def test_app(test_settings):
    app = create_app(test_settings)
    return app

@pytest.fixture
async def db_session(test_settings) -> AsyncGenerator[AsyncSession, None]:
    # We need to ensure the engine and tables are created for each test
    engine = create_async_engine(TEST_DATABASE_URL)
    # Import all models to register with Base.metadata
    from app.models import WalletModel, AddressModel, TokenBalanceModel, WalletTransactionModel
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    
    await engine.dispose()

@pytest.fixture
async def client(test_app, test_settings) -> AsyncGenerator[AsyncClient, None]:
    # Override get_db_dep to use the same in-memory DB
    engine = create_async_engine(TEST_DATABASE_URL)
    from app.models import WalletModel, AddressModel, TokenBalanceModel, WalletTransactionModel
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    test_app.dependency_overrides[get_db_dep] = override_get_db
    
    async with AsyncClient(app=test_app, base_url="http://test") as ac:
        yield ac
        
    test_app.dependency_overrides.clear()
    await engine.dispose()
