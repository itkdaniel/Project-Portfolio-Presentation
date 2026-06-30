from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import WalletModel, AddressModel, TokenBalanceModel, WalletTransactionModel
from datetime import datetime

async def seed_db(session: AsyncSession) -> None:
    # Check if we already have data
    result = await session.execute(select(WalletModel).limit(1))
    if result.scalars().first():
        return

    # User ID for demo
    user_id = "demo-user"

    # 1. Main EVM Wallet
    evm_wallet = WalletModel(
        user_id=user_id,
        name="Main EVM Wallet",
        chain="EVM",
        hd_path="m/44'/60'/0'",
        master_pubkey="xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcUr6"
    )
    session.add(evm_wallet)
    await session.flush()

    # Add EVM addresses
    evm_addrs = [
        AddressModel(wallet_id=evm_wallet.id, path_index=0, address="0x742d35Cc6634C0532925a3b844Bc454e4438f44e", chain="EVM", label="Main"),
        AddressModel(wallet_id=evm_wallet.id, path_index=1, address="0x8F3Cf7ad57849170701041926671041926671041", chain="EVM", label="DeFi"),
        AddressModel(wallet_id=evm_wallet.id, path_index=2, address="0x1234567890123456789012345678901234567890", chain="EVM", label="Savings")
    ]
    session.add_all(evm_addrs)
    await session.flush()

    # Add Balances for EVM
    # addr0: ETH=2.5, USDC=5000
    session.add_all([
        TokenBalanceModel(address_id=evm_addrs[0].id, token_symbol="ETH", amount=2.5, amount_raw="2500000000000000000"),
        TokenBalanceModel(address_id=evm_addrs[0].id, token_symbol="USDC", contract_address="0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", amount=5000.0, amount_raw="5000000000")
    ])
    # addr1: MATIC=500, USDC=1000
    session.add_all([
        TokenBalanceModel(address_id=evm_addrs[1].id, token_symbol="MATIC", amount=500.0, amount_raw="500000000000000000000"),
        TokenBalanceModel(address_id=evm_addrs[1].id, token_symbol="USDC", contract_address="0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", amount=1000.0, amount_raw="1000000000")
    ])
    # addr2: ETH=0.1
    session.add(TokenBalanceModel(address_id=evm_addrs[2].id, token_symbol="ETH", amount=0.1, amount_raw="100000000000000000"))

    # Add 5 transactions for EVM
    session.add_all([
        WalletTransactionModel(
            wallet_id=evm_wallet.id, from_address="0x0", to_address=evm_addrs[0].address, 
            tx_hash="0x123...", chain="EVM", direction="in", amount=2.5, token_symbol="ETH"
        ),
        WalletTransactionModel(
            wallet_id=evm_wallet.id, from_address=evm_addrs[0].address, to_address="0xABC...", 
            tx_hash="0x456...", chain="EVM", direction="out", amount=100.0, token_symbol="USDC", contract_address="0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
        ),
        WalletTransactionModel(
            wallet_id=evm_wallet.id, from_address="0xDEF...", to_address=evm_addrs[0].address, 
            tx_hash="0x789...", chain="EVM", direction="in", amount=5100.0, token_symbol="USDC", contract_address="0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
        ),
        WalletTransactionModel(
            wallet_id=evm_wallet.id, from_address="0x0", to_address=evm_addrs[1].address, 
            tx_hash="0xabc...", chain="EVM", direction="in", amount=500.0, token_symbol="MATIC"
        ),
        WalletTransactionModel(
            wallet_id=evm_wallet.id, from_address=evm_addrs[0].address, to_address="0x789...", 
            tx_hash="0xdef...", chain="EVM", direction="out", amount=0.5, token_symbol="ETH"
        )
    ])

    # 2. Solana Wallet
    sol_wallet = WalletModel(
        user_id=user_id,
        name="Solana Wallet",
        chain="SOL",
        hd_path="m/44'/501'/0'",
        master_pubkey="7p9uFvD8..."
    )
    session.add(sol_wallet)
    await session.flush()

    sol_addrs = [
        AddressModel(wallet_id=sol_wallet.id, path_index=0, address="8fS7...addr0", chain="SOL", label="Main SOL"),
        AddressModel(wallet_id=sol_wallet.id, path_index=1, address="9gT8...addr1", chain="SOL", label="NFT SOL")
    ]
    session.add_all(sol_addrs)
    await session.flush()

    # Balances for SOL
    # addr0: SOL=25.0, USDC=2000
    session.add_all([
        TokenBalanceModel(address_id=sol_addrs[0].id, token_symbol="SOL", amount=25.0, amount_raw="25000000000"),
        TokenBalanceModel(address_id=sol_addrs[0].id, token_symbol="USDC", contract_address="EPjFW3...usdc", amount=2000.0, amount_raw="2000000000")
    ])

    await session.commit()
