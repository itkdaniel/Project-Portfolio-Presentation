from pytest_bdd import scenario, given, when, then
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
@scenario("wallet_lifecycle.feature", "Create and retrieve a wallet")
def test_wallet_lifecycle():
    pass

@given("the crypto-wallet service is running", target_fixture="client_fixture")
async def client_fixture(client):
    return client

@when("I create a wallet for user 'bdd-user'", target_fixture="create_resp")
async def create_wallet_bdd(client_fixture):
    payload = {
        "user_id": "bdd-user",
        "name": "BDD Wallet",
        "chain": "EVM",
        "hd_path": "m/44/60/0/0/0",
        "master_pubkey": "xpubBDD"
    }
    return await client_fixture.post("/v1/wallet/wallets", json=payload)

@then("the wallet should be created successfully")
def check_created(create_resp):
    assert create_resp.status_code == 201
    assert create_resp.json()["name"] == "BDD Wallet"

@then("I can retrieve it via user_id")
async def retrieve_wallet_bdd(client_fixture, create_resp):
    resp = await client_fixture.get("/v1/wallet/wallets?user_id=bdd-user")
    assert resp.status_code == 200
    wallets = resp.json()
    assert any(w["name"] == "BDD Wallet" for w in wallets)
