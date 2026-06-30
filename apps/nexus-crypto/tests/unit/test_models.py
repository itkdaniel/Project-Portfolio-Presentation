import pytest
from sqlalchemy import select
from app.models import CryptoUserModel, PortfolioModel, PortfolioAssetModel, WatchlistModel
from app.seed import seed_db

@pytest.mark.asyncio
async def test_seed_data(test_db):
    await seed_db(test_db)
    
    # Verify user
    stmt = select(CryptoUserModel).where(CryptoUserModel.user_id == "demo-user-001")
    result = await test_db.execute(stmt)
    user = result.scalar_one()
    assert user.username == "cryptodemo"
    
    # Verify portfolio
    stmt = select(PortfolioModel).where(PortfolioModel.user_id == "demo-user-001")
    result = await test_db.execute(stmt)
    portfolio = result.scalar_one()
    assert portfolio.name == "Main Portfolio"
    
    # Verify assets
    stmt = select(PortfolioAssetModel).where(PortfolioAssetModel.portfolio_id == portfolio.id)
    result = await test_db.execute(stmt)
    assets = result.scalars().all()
    assert len(assets) == 5
    
    # Verify watchlist
    stmt = select(WatchlistModel).where(WatchlistModel.user_id == "demo-user-001")
    result = await test_db.execute(stmt)
    watchlist = result.scalars().all()
    assert len(watchlist) == 5
