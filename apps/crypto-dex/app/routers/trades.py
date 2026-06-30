from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.database import get_db_dep
from app.models import TradeModel, TradeRead

router = APIRouter(prefix="/v1/dex/trades", tags=["trades"])

@router.get("", response_model=List[TradeRead])
async def list_trades(
    pool_id: Optional[int] = None,
    trader_address: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db_dep)
):
    query = select(TradeModel)
    if pool_id:
        query = query.where(TradeModel.pool_id == pool_id)
    if trader_address:
        query = query.where(TradeModel.trader_address == trader_address)
    query = query.limit(limit).order_by(TradeModel.executed_at.desc())
    
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{trade_id}", response_model=TradeRead)
async def get_trade(trade_id: int, db: AsyncSession = Depends(get_db_dep)):
    trade = await db.get(TradeModel, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade
