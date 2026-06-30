from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db_dep
from app.models import CoinModel, OHLCVCandleModel, OHLCVCandleRead, OHLCVCandleIngest
from typing import list

router = APIRouter(prefix="/v1/market/candles", tags=["candles"])

@router.get("/{symbol}", response_model=list[OHLCVCandleRead])
async def list_candles(
    symbol: str, 
    interval: str = "1d", 
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db_dep)
):
    stmt = select(CoinModel).where(CoinModel.symbol == symbol.upper())
    res = await db.execute(stmt)
    coin = res.scalar_one_or_none()
    if not coin:
        raise HTTPException(status_code=404, detail="Coin not found")
        
    stmt = select(OHLCVCandleModel).where(
        (OHLCVCandleModel.coin_id == coin.id) & 
        (OHLCVCandleModel.interval == interval)
    ).order_by(OHLCVCandleModel.open_time.desc()).limit(limit)
    
    result = await db.execute(stmt)
    items = []
    for candle in result.scalars().all():
        read_obj = OHLCVCandleRead.from_orm(candle)
        read_obj.coin_symbol = coin.symbol
        items.append(read_obj)
    return items

@router.post("/ingest", response_model=list[OHLCVCandleRead])
async def ingest_candles(body: list[OHLCVCandleIngest], db: AsyncSession = Depends(get_db_dep)):
    results = []
    for item in body:
        stmt = select(CoinModel).where(CoinModel.symbol == item.symbol.upper())
        res = await db.execute(stmt)
        coin = res.scalar_one_or_none()
        if not coin:
            continue
            
        candle = OHLCVCandleModel(
            coin_id=coin.id,
            exchange_slug=item.exchange_slug,
            interval=item.interval,
            open_time=item.open_time,
            open=item.open,
            high=item.high,
            low=item.low,
            close=item.close,
            volume=item.volume,
            quote_volume=item.quote_volume,
            trade_count=item.trade_count
        )
        db.add(candle)
        results.append((candle, coin.symbol))
        
    await db.commit()
    
    final = []
    for c, sym in results:
        await db.refresh(c)
        read_obj = OHLCVCandleRead.from_orm(c)
        read_obj.coin_symbol = sym
        final.append(read_obj)
    return final
