import pytest
from app.models import CoinRead, PriceTickRead, ExchangeRead, OHLCVCandleRead, PriceTickIngest
from app.seed import seed_db
from sqlalchemy import select
from app.models import CoinModel, ExchangeModel, PriceTickModel, OHLCVCandleModel

@pytest.mark.asyncio
async def test_seed_data(db_session):
    await seed_db(db_session)
    
    # Check exchanges
    res = await db_session.execute(select(ExchangeModel))
    exchanges = res.scalars().all()
    assert len(exchanges) >= 3
    
    # Check coins
    res = await db_session.execute(select(CoinModel))
    coins = res.scalars().all()
    assert len(coins) >= 10
    
    # Check prices
    res = await db_session.execute(select(PriceTickModel))
    ticks = res.scalars().all()
    assert len(ticks) >= 10
    
    # Check candles
    res = await db_session.execute(select(OHLCVCandleModel))
    candles = res.scalars().all()
    assert len(candles) >= 90 # 3 coins * 30 days

def test_coin_read_schema():
    data = {
        "id": 1,
        "symbol": "BTC",
        "name": "Bitcoin",
        "coingecko_id": "bitcoin",
        "decimals": 8,
        "logo_url": "http://example.com/logo.png",
        "is_active": True,
        "sort_order": 0
    }
    obj = CoinRead(**data)
    assert obj.symbol == "BTC"

def test_price_tick_read_schema():
    from datetime import datetime
    data = {
        "id": 1,
        "coin_id": 1,
        "coin_symbol": "BTC",
        "exchange_slug": "binance",
        "price_usd": 60000.0,
        "volume_24h": 1000000.0,
        "price_change_24h": 2.5,
        "price_change_7d": 10.0,
        "recorded_at": datetime.now()
    }
    obj = PriceTickRead(**data)
    assert obj.price_usd == 60000.0

@pytest.mark.asyncio
async def test_price_tick_ingest_validation():
    data = {
        "symbol": "BTC",
        "price_usd": 67000.0,
        "exchange_slug": "binance",
        "volume_24h": 500000000.0
    }
    obj = PriceTickIngest(**data)
    assert obj.symbol == "BTC"
    assert obj.exchange_slug == "binance"
