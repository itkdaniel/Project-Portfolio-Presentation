from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db_dep
from app.models import CoinModel, PriceTickModel, PriceTickRead, PriceTickIngest
from datetime import datetime, timezone

router = APIRouter(prefix="/v1/market/prices", tags=["prices"])

@router.get("", response_model=list[PriceTickRead])
async def list_latest_prices(db: AsyncSession = Depends(get_db_dep)):
    # Get latest tick per coin
    # In a real DB we might use DISTINCT ON (coin_id) ORDER BY coin_id, recorded_at DESC
    # For SQLite/General compatibility, we'll subquery the max(recorded_at)
    
    subq = select(
        PriceTickModel.coin_id,
        func.max(PriceTickModel.recorded_at).label("max_ts")
    ).group_by(PriceTickModel.coin_id).subquery()
    
    stmt = select(PriceTickModel, CoinModel.symbol).join(
        CoinModel, PriceTickModel.coin_id == CoinModel.id
    ).join(
        subq, (PriceTickModel.coin_id == subq.c.coin_id) & (PriceTickModel.recorded_at == subq.c.max_ts)
    )
    
    result = await db.execute(stmt)
    items = []
    for tick, symbol in result:
        read_obj = PriceTickRead.from_orm(tick)
        read_obj.coin_symbol = symbol
        items.append(read_obj)
    return items

@router.get("/{symbol}", response_model=PriceTickRead)
async def get_latest_price(symbol: str, db: AsyncSession = Depends(get_db_dep)):
    stmt = select(CoinModel).where(CoinModel.symbol == symbol.upper())
    res = await db.execute(stmt)
    coin = res.scalar_one_or_none()
    if not coin:
        raise HTTPException(status_code=404, detail="Coin not found")
        
    stmt = select(PriceTickModel).where(PriceTickModel.coin_id == coin.id).order_by(PriceTickModel.recorded_at.desc()).limit(1)
    result = await db.execute(stmt)
    tick = result.scalar_one_or_none()
    if not tick:
        raise HTTPException(status_code=404, detail="No price data for coin")
        
    read_obj = PriceTickRead.from_orm(tick)
    read_obj.coin_symbol = coin.symbol
    return read_obj

@router.post("/ingest", response_model=PriceTickRead)
async def ingest_price(body: PriceTickIngest, db: AsyncSession = Depends(get_db_dep)):
    stmt = select(CoinModel).where(CoinModel.symbol == body.symbol.upper())
    res = await db.execute(stmt)
    coin = res.scalar_one_or_none()
    if not coin:
        raise HTTPException(status_code=404, detail="Coin not found")
        
    tick = PriceTickModel(
        coin_id=coin.id,
        exchange_slug=body.exchange_slug,
        price_usd=body.price_usd,
        bid=body.bid,
        ask=body.ask,
        volume_24h=body.volume_24h,
        price_change_24h=body.price_change_24h,
        price_change_7d=body.price_change_7d,
        market_cap=body.market_cap,
        circulating_supply=body.circulating_supply,
        recorded_at=datetime.now(timezone.utc)
    )
    db.add(tick)
    await db.commit()
    await db.refresh(tick)
    
    read_obj = PriceTickRead.from_orm(tick)
    read_obj.coin_symbol = coin.symbol
    return read_obj
