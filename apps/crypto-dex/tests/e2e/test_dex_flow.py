import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_full_dex_flow(client: AsyncClient):
    # 1. Ingest/Create Pool
    response = await client.post("/v1/dex/pools", json={
        "name": "FLOW/USDC",
        "token_a": "FLOW",
        "token_b": "USDC",
        "initial_reserve_a": 1000,
        "initial_reserve_b": 1000
    })
    assert response.status_code == 200
    pool_id = response.json()["id"]

    # 2. Add Liquidity
    response = await client.post("/v1/dex/liquidity/add", json={
        "pool_id": pool_id,
        "user_address": "0xUSER",
        "amount_a": 500,
        "amount_b": 500
    })
    assert response.status_code == 200

    # 3. Swap (Market Order)
    response = await client.post("/v1/dex/orders", json={
        "pool_id": pool_id,
        "trader_address": "0xUSER",
        "order_type": "market",
        "side": "buy",
        "token_in": "USDC",
        "token_out": "FLOW",
        "amount_in": 100
    })
    assert response.status_code == 200
    order_id = response.json()["id"]

    # 4. Check Trade History
    response = await client.get(f"/v1/dex/trades?pool_id={pool_id}")
    assert response.status_code == 200
    assert len(response.json()) >= 1

    # 5. Check Order Details
    response = await client.get(f"/v1/dex/orders/{order_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "filled"

    # 6. Quote accuracy
    response = await client.get(f"/v1/dex/pools/{pool_id}/quote?token_in=USDC&amount_in=10")
    assert response.status_code == 200
    quote = response.json()
    assert quote["amount_out"] > 0

    # 7. Remove all liquidity
    response = await client.get(f"/v1/dex/liquidity?user_address=0xUSER")
    pos_id = response.json()[0]["id"]
    lp_tokens = response.json()[0]["lp_tokens"]
    
    response = await client.post("/v1/dex/liquidity/remove", json={
        "position_id": pos_id,
        "lp_tokens": lp_tokens
    })
    assert response.status_code == 200
