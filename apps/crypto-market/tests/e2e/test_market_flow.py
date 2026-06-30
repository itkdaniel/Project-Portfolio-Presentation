import pytest
from app.seed import seed_db
from datetime import datetime, timezone

@pytest.mark.asyncio
async def test_full_market_flow(client, db_session):
    await seed_db(db_session)
    
    # 1. List coins
    resp = await client.get("/v1/market/coins")
    assert resp.status_code == 200
    assert len(resp.json()) >= 10
    
    # 2. Get coin details
    resp = await client.get("/v1/market/coins/ETH")
    assert resp.status_code == 200
    assert resp.json()["symbol"] == "ETH"
    
    # 3. List prices
    resp = await client.get("/v1/market/prices")
    assert resp.status_code == 200
    
    # 4. Ingest new price
    resp = await client.post("/v1/market/prices/ingest", json={
        "symbol": "ETH",
        "price_usd": 3500.0,
        "exchange_slug": "binance"
    })
    assert resp.status_code == 200
    
    # 5. Get latest price for ETH
    resp = await client.get("/v1/market/prices/ETH")
    assert resp.json()["price_usd"] == 3500.0
    
    # 6. Ingest candles
    candle_data = [
        {
            "symbol": "ETH",
            "interval": "1h",
            "open_time": datetime.now(timezone.utc).isoformat(),
            "open": 3400.0,
            "high": 3600.0,
            "low": 3300.0,
            "close": 3500.0,
            "volume": 1000.0
        }
    ]
    resp = await client.post("/v1/market/candles/ingest", json=candle_data)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    
    # 7. Query candles
    resp = await client.get("/v1/market/candles/ETH?interval=1h")
    assert resp.status_code == 200
    assert any(c["close"] == 3500.0 for c in resp.json())
    
    # 8. List exchanges
    resp = await client.get("/v1/market/exchanges")
    assert resp.status_code == 200
    assert len(resp.json()) >= 3

@pytest.mark.asyncio
async def test_error_handling(client, db_session):
    # Non-existent coin
    resp = await client.get("/v1/market/coins/NONEXISTENT")
    assert resp.status_code == 404
    
    # Non-existent price
    resp = await client.get("/v1/market/prices/NONEXISTENT")
    assert resp.status_code == 404
    
    # Invalid ingest
    resp = await client.post("/v1/market/prices/ingest", json={"symbol": "BTC"}) # Missing fields
    assert resp.status_code == 422
