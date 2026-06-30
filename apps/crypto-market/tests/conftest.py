import pytest
import asyncio
from typing import AsyncGenerator
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.main import create_app
from app.config import Settings
from app.database import Base, get_db_dep

# Test settings
test_settings = Settings(
    app_name="crypto-market-test",
    database_url="sqlite+aiosqlite:///:memory:",
    debug=True
)

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(test_settings.database_url)
    async with engine.begin() as conn:
        from app.models import CoinModel, ExchangeModel, PriceTickModel, OHLCVCandleModel
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        yield session
        await session.rollback()

@pytest.fixture
async def client(test_engine, db_session) -> AsyncGenerator[AsyncClient, None]:
    app = create_app(test_settings)
    
    # Override get_db_dep to use the test session
    async def override_get_db():
        yield db_session
        
    app.dependency_overrides[get_db_dep] = override_get_db
    
    # Manually seed for tests if needed, or rely on app lifespan (but lifespan uses real DB unless we are careful)
    # The create_app factory above will trigger lifespan which seeds its own DB. 
    # For unit tests, we often want a clean slate or controlled seed.
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
