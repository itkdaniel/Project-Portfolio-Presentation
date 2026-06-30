from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db_dep
from app.models import CoinModel, CoinRead

router = APIRouter(prefix="/v1/market/coins", tags=["coins"])

@router.get("", response_model=list[CoinRead])
async def list_coins(db: AsyncSession = Depends(get_db_dep)):
    stmt = select(CoinModel).where(CoinModel.is_active == True).order_by(CoinModel.sort_order)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{symbol}", response_model=CoinRead)
async def get_coin(symbol: str, db: AsyncSession = Depends(get_db_dep)):
    stmt = select(CoinModel).where(CoinModel.symbol == symbol.upper())
    result = await db.execute(stmt)
    coin = result.scalar_one_or_none()
    if not coin:
        raise HTTPException(status_code=404, detail="Coin not found")
    return coin
