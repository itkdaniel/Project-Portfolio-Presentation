import pytest
from sqlalchemy import select
from app.models import PoolModel, TradeModel, LiquidityPositionModel, OrderModel
from app.seed import seed_db

@pytest.mark.asyncio
async def test_seed_data_integrity(db_session):
    await seed_db(db_session)
    
    # Check pools
    result = await db_session.execute(select(PoolModel))
    pools = result.scalars().all()
    assert len(pools) == 5
    
    # Check liquidity positions
    result = await db_session.execute(select(LiquidityPositionModel))
    positions = result.scalars().all()
    assert len(positions) == 3
    
    # Check trades
    result = await db_session.execute(select(TradeModel))
    trades = result.scalars().all()
    assert len(trades) == 50 # 5 pools * 10 trades
    
    # Check orders
    result = await db_session.execute(select(OrderModel))
    orders = result.scalars().all()
    assert len(orders) == 50
