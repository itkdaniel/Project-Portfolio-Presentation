import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_swap_scenario(client: AsyncClient):
    # 1. Create a pool
    pool_data = {
        "name": "TEST/USDC",
        "token_a": "TEST",
        "token_b": "USDC",
        "initial_reserve_a": 1000.0,
        "initial_reserve_b": 1000.0,
        "fee_bps": 30
    }
    response = await client.post("/v1/dex/pools", json=pool_data)
    assert response.status_code == 200
    pool = response.json()
    pool_id = pool["id"]

    # 2. Get a quote
    response = await client.get(f"/v1/dex/pools/{pool_id}/quote?token_in=TEST&amount_in=100")
    assert response.status_code == 200
    quote = response.json()
    assert quote["amount_out"] > 0
    assert quote["price_impact_pct"] > 0

    # 3. Place a market order
    order_data = {
        "pool_id": pool_id,
        "trader_address": "0x123",
        "order_type": "market",
        "side": "sell",
        "token_in": "TEST",
        "token_out": "USDC",
        "amount_in": 100.0,
        "amount_out_min": 0.0
    }
    response = await client.post("/v1/dex/orders", json=order_data)
    assert response.status_code == 200
    order = response.json()
    assert order["status"] == "filled"
    assert order["amount_out_actual"] > 0

    # 4. Check pool reserves updated
    response = await client.get(f"/v1/dex/pools/{pool_id}")
    updated_pool = response.json()
    assert updated_pool["reserve_a"] == 1100.0
    assert updated_pool["reserve_b"] < 1000.0

@pytest.mark.asyncio
async def test_liquidity_scenario(client: AsyncClient):
    # 1. Create pool
    pool_data = {
        "name": "LIQ/USDC",
        "token_a": "LIQ",
        "token_b": "USDC",
        "initial_reserve_a": 100.0,
        "initial_reserve_b": 100.0
    }
    response = await client.post("/v1/dex/pools", json=pool_data)
    pool_id = response.json()["id"]

    # 2. Add liquidity
    liq_data = {
        "pool_id": pool_id,
        "user_address": "0xLP",
        "amount_a": 50.0,
        "amount_b": 50.0
    }
    response = await client.post("/v1/dex/liquidity/add", json=liq_data)
    assert response.status_code == 200
    pos = response.json()
    assert pos["lp_tokens"] > 0
    pos_id = pos["id"]

    # 3. Remove liquidity
    rem_data = {
        "position_id": pos_id,
        "lp_tokens": pos["lp_tokens"] / 2
    }
    response = await client.post("/v1/dex/liquidity/remove", json=rem_data)
    assert response.status_code == 200
    updated_pos = response.json()
    assert updated_pos["lp_tokens"] > 0
