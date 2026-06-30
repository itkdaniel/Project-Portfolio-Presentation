import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_wallet_flow(client):
    # 1. Create Wallet
    wallet_data = {
        "user_id": "flow-user",
        "name": "Flow Wallet",
        "chain": "EVM",
        "hd_path": "m/44/60/0/0/0",
        "master_pubkey": "xpubFlow"
    }
    resp = await client.post("/v1/wallet/wallets", json=wallet_data)
    assert resp.status_code == 201
    wallet = resp.json()
    wallet_id = wallet["id"]
    
    # 2. List Wallets
    resp = await client.get(f"/v1/wallet/wallets?user_id=flow-user")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    
    # 3. Create Address
    resp = await client.post("/v1/wallet/addresses", params={
        "wallet_id": wallet_id,
        "path_index": 0,
        "address": "0xFlowAddr",
        "chain": "EVM"
    })
    assert resp.status_code == 201
    addr = resp.json()
    addr_id = addr["id"]
    
    # 4. Sync Balance
    sync_data = {
        "address_id": addr_id,
        "balances": [
            {"token_symbol": "ETH", "amount": 1.23},
            {"token_symbol": "USDC", "amount": 100.0, "contract_address": "0xUSDC"}
        ]
    }
    resp = await client.post("/v1/wallet/balances/sync", json=sync_data)
    assert resp.status_code == 200
    
    # 5. Check Aggregated Balance
    resp = await client.get(f"/v1/wallet/addresses/{wallet_id}/balance")
    assert resp.status_code == 200
    balances = resp.json()
    assert any(b["token_symbol"] == "ETH" and b["total_amount"] == 1.23 for b in balances)
    
    # 6. Record Transaction
    tx_data = {
        "wallet_id": wallet_id,
        "from_address": "0xFlowAddr",
        "to_address": "0xRecipient",
        "tx_hash": "txFlowHash",
        "chain": "EVM",
        "direction": "out",
        "amount": 0.5
    }
    resp = await client.post("/v1/wallet/transactions", json=tx_data)
    assert resp.status_code == 201
    
    # 7. List Transactions
    resp = await client.get(f"/v1/wallet/transactions?wallet_id={wallet_id}")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["tx_hash"] == "txFlowHash"
