import pytest
from app.models import WalletModel, AddressModel, TokenBalanceModel, WalletTransactionModel, WalletCreate
from sqlalchemy import select

@pytest.mark.asyncio
async def test_wallet_creation(db_session):
    wallet = WalletModel(
        user_id="test-user",
        name="Test Wallet",
        chain="EVM",
        hd_path="m/44'/60'/0'/0/0",
        master_pubkey="xpub123..."
    )
    db_session.add(wallet)
    await db_session.commit()
    
    result = await db_session.execute(select(WalletModel).where(WalletModel.user_id == "test-user"))
    found = result.scalar_one()
    assert found.name == "Test Wallet"
    assert found.chain == "EVM"

@pytest.mark.asyncio
async def test_address_relationship(db_session):
    wallet = WalletModel(
        user_id="test-user",
        name="Test Wallet",
        chain="EVM",
        hd_path="m/44'/60'/0'/0/0",
        master_pubkey="xpub123..."
    )
    db_session.add(wallet)
    await db_session.flush()
    
    addr = AddressModel(
        wallet_id=wallet.id,
        path_index=0,
        address="0xTestAddress",
        chain="EVM"
    )
    db_session.add(addr)
    await db_session.commit()
    
    result = await db_session.execute(select(AddressModel).where(AddressModel.address == "0xTestAddress"))
    found = result.scalar_one()
    assert found.wallet_id == wallet.id

@pytest.mark.asyncio
async def test_balance_sync(db_session):
    wallet = WalletModel(user_id="u1", name="w1", chain="EVM", hd_path="p1", master_pubkey="pk1")
    db_session.add(wallet)
    await db_session.flush()
    
    addr = AddressModel(wallet_id=wallet.id, path_index=0, address="a1", chain="EVM")
    db_session.add(addr)
    await db_session.flush()
    
    bal = TokenBalanceModel(address_id=addr.id, token_symbol="ETH", amount=1.5)
    db_session.add(bal)
    await db_session.commit()
    
    result = await db_session.execute(select(TokenBalanceModel).where(TokenBalanceModel.address_id == addr.id))
    found = result.scalars().all()
    assert len(found) == 1
    assert found[0].token_symbol == "ETH"
    assert found[0].amount == 1.5

@pytest.mark.asyncio
async def test_transaction_recording(db_session):
    wallet = WalletModel(user_id="u1", name="w1", chain="EVM", hd_path="p1", master_pubkey="pk1")
    db_session.add(wallet)
    await db_session.flush()
    
    tx = WalletTransactionModel(
        wallet_id=wallet.id,
        from_address="0x1",
        to_address="0x2",
        tx_hash="hash1",
        chain="EVM",
        direction="in",
        amount=1.0
    )
    db_session.add(tx)
    await db_session.commit()
    
    result = await db_session.execute(select(WalletTransactionModel).where(WalletTransactionModel.tx_hash == "hash1"))
    found = result.scalar_one()
    assert found.amount == 1.0
    assert found.wallet_id == wallet.id
