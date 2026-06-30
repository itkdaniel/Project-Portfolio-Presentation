import pytest

@pytest.mark.asyncio
async def test_full_crypto_flow(client):
    # 1. Register
    reg_data = {"username": "newuser", "email": "new@nexus.dev", "password": "Password123!"}
    resp = await client.post("/v1/crypto/auth/register", json=reg_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get Me
    resp = await client.get("/v1/crypto/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["username"] == "newuser"

    # 3. List Coins
    resp = await client.get("/v1/crypto/coins")
    assert resp.status_code == 200
    assert len(resp.json()) >= 10

    # 4. Portfolio - should be empty initially for new user
    resp = await client.get("/v1/crypto/portfolio", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["assets"]) == 0

    # 5. Add Asset
    asset_data = {"coin_symbol": "BTC", "quantity": 1.5, "avg_cost_basis": 50000.0}
    resp = await client.post("/v1/crypto/portfolio/assets", json=asset_data, headers=headers)
    assert resp.status_code == 200
    asset_id = resp.json()["id"]

    # 6. Verify Portfolio
    resp = await client.get("/v1/crypto/portfolio", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["assets"]) == 1
    assert resp.json()["total_value_usd"] > 0

    # 7. Update Asset
    resp = await client.patch(f"/v1/crypto/portfolio/assets/{asset_id}", json={"quantity": 2.0}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["quantity"] == 2.0

    # 8. Watchlist
    resp = await client.post("/v1/crypto/watchlist", json={"coin_symbol": "ETH"}, headers=headers)
    assert resp.status_code == 200
    
    resp = await client.get("/v1/crypto/watchlist", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["coin_symbol"] == "ETH"

    # 9. Delete Asset
    resp = await client.delete(f"/v1/crypto/portfolio/assets/{asset_id}", headers=headers)
    assert resp.status_code == 200
    
    resp = await client.get("/v1/crypto/portfolio", headers=headers)
    assert len(resp.json()["assets"]) == 0
