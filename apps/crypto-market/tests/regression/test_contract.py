import pytest

@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "crypto-market-test"

@pytest.mark.asyncio
async def test_info_endpoint(client):
    response = await client.get("/info")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "crypto-market-test"
    assert "endpoints" in data

@pytest.mark.asyncio
async def test_coins_contract(client, db_session):
    from app.seed import seed_db
    await seed_db(db_session)
    response = await client.get("/v1/market/coins")
    assert response.status_code == 200
    coins = response.json()
    if len(coins) > 0:
        coin = coins[0]
        assert "symbol" in coin
        assert "name" in coin
        assert "is_active" in coin
