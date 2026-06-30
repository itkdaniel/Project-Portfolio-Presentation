import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_contract_health(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "crypto-dex"

@pytest.mark.asyncio
async def test_contract_info(client: AsyncClient):
    response = await client.get("/info")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "endpoints" in data

@pytest.mark.asyncio
async def test_contract_pool_shape(client: AsyncClient):
    response = await client.get("/v1/dex/pools")
    assert response.status_code == 200
    pools = response.json()
    if len(pools) > 0:
        pool = pools[0]
        assert "name" in pool
        assert "token_a" in pool
        assert "reserve_a" in pool
