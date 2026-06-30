from __future__ import annotations

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import CryptoUserModel, PortfolioModel, PortfolioAssetModel, WatchlistModel
from app.auth import hash_password

async def seed_db(session: AsyncSession) -> None:
    # 1. Seed demo user
    user_id = "demo-user-001"
    stmt = select(CryptoUserModel).where(CryptoUserModel.user_id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = CryptoUserModel(
            user_id=user_id,
            username="cryptodemo",
            email="crypto@nexus.dev",
            password_hash=hash_password("CryptoDemo2024!"),
            is_active=True
        )
        session.add(user)
        await session.flush()

    # 2. Seed default portfolio
    stmt = select(PortfolioModel).where(PortfolioModel.user_id == user_id, PortfolioModel.name == "Main Portfolio")
    result = await session.execute(stmt)
    portfolio = result.scalar_one_or_none()

    if not portfolio:
        portfolio = PortfolioModel(
            user_id=user_id,
            name="Main Portfolio",
            description="Default demo portfolio",
            is_default=True
        )
        session.add(portfolio)
        await session.flush()

        # Seed assets
        assets = [
            {"coin_symbol": "BTC", "quantity": 0.5, "avg_cost_basis": 60000.0, "chain": "BTC"},
            {"coin_symbol": "ETH", "quantity": 3.2, "avg_cost_basis": 3000.0, "chain": "EVM"},
            {"coin_symbol": "SOL", "quantity": 50.0, "avg_cost_basis": 140.0, "chain": "SOL"},
            {"coin_symbol": "USDC", "quantity": 5000.0, "avg_cost_basis": 1.0, "chain": "EVM"},
            {"coin_symbol": "MATIC", "quantity": 1000.0, "avg_cost_basis": 0.9, "chain": "EVM"},
        ]
        for asset_data in assets:
            asset = PortfolioAssetModel(
                portfolio_id=portfolio.id,
                **asset_data
            )
            session.add(asset)

    # 3. Seed Watchlist
    watchlist_symbols = ["BTC", "ETH", "SOL", "ADA", "AVAX"]
    for symbol in watchlist_symbols:
        stmt = select(WatchlistModel).where(WatchlistModel.user_id == user_id, WatchlistModel.coin_symbol == symbol)
        result = await session.execute(stmt)
        if not result.scalar_one_or_none():
            watchlist = WatchlistModel(user_id=user_id, coin_symbol=symbol)
            session.add(watchlist)

    await session.commit()
