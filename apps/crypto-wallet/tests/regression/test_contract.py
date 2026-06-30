import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_contract(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "service" in data
    assert "version" in data
    assert "uptime" in data

@pytest.mark.asyncio
async def test_info_contract(client):
    resp = await client.get("/info")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "crypto-wallet"
    assert "endpoints" in data
    assert isinstance(data["endpoints"], list)

@pytest.mark.asyncio
async def test_wallets_list_contract(client):
    # This should return 422 because user_id is required
    resp = await client.get("/v1/wallet/wallets")
    assert resp.status_code == 422
    
    # Valid call
    resp = await client.get("/v1/wallet/wallets?user_id=test")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
