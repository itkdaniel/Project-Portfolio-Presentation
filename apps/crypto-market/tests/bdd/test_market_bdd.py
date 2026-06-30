import pytest
from app.seed import seed_db

@pytest.mark.asyncio
async def test_market_overview_scenario(client, db_session):
    """Scenario: User views the market overview with coins and their latest prices."""
    await seed_db(db_session)
    
    # 1. Get all coins
    response = await client.get("/v1/market/coins")
    assert response.status_code == 200
    coins = response.json()
    assert len(coins) >= 10
    assert any(c["symbol"] == "BTC" for c in coins)
    
    # 2. Get latest prices
    response = await client.get("/v1/market/prices")
    assert response.status_code == 200
    prices = response.json()
    assert len(prices) >= 10
    
    # 3. Check specific price
    response = await client.get("/v1/market/prices/BTC")
    assert response.status_code == 200
    assert response.json()["coin_symbol"] == "BTC"

@pytest.mark.asyncio
async def test_exchange_list_scenario(client, db_session):
    """Scenario: User lists available exchanges."""
    await seed_db(db_session)
    response = await client.get("/v1/market/exchanges")
    assert response.status_code == 200
    exchanges = response.json()
    assert len(exchanges) >= 3
    assert any(e["slug"] == "binance" for e in exchanges)

@pytest.mark.asyncio
async def test_price_ingestion_scenario(client, db_session):
    """Scenario: System ingests new price data."""
    await seed_db(db_session)
    
    new_tick = {
        "symbol": "BTC",
        "price_usd": 68000.0,
        "exchange_slug": "coinbase",
        "volume_24h": 600000000.0
    }
    
    response = await client.post("/v1/market/prices/ingest", json=new_tick)
    assert response.status_code == 200
    assert response.json()["price_usd"] == 68000.0
    
    # Verify it is now the latest
    response = await client.get("/v1/market/prices/BTC")
    assert response.json()["price_usd"] == 68000.0

@pytest.mark.asyncio
async def test_candle_retrieval_scenario(client, db_session):
    """Scenario: User retrieves OHLCV candles for technical analysis."""
    await seed_db(db_session)
    response = await client.get("/v1/market/candles/BTC?interval=1d&limit=10")
    assert response.status_code == 200
    candles = response.json()
    assert len(candles) > 0
    assert "open" in candles[0]
