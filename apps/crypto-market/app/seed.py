"""
Seed data for crypto-market.
"""
import random
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import CoinModel, ExchangeModel, PriceTickModel, OHLCVCandleModel


async def seed_db(session: AsyncSession) -> None:
    # 1. Seed Exchanges
    exchanges_data = [
        {"slug": "binance", "name": "Binance", "api_url": "https://api.binance.com"},
        {"slug": "coinbase", "name": "Coinbase", "api_url": "https://api.coinbase.com"},
        {"slug": "kraken", "name": "Kraken", "api_url": "https://api.kraken.com"},
    ]
    
    for ex_data in exchanges_data:
        stmt = select(ExchangeModel).where(ExchangeModel.slug == ex_data["slug"])
        result = await session.execute(stmt)
        if not result.scalar_one_or_none():
            session.add(ExchangeModel(**ex_data))

    # 2. Seed Coins
    coins_data = [
        {"symbol": "BTC", "name": "Bitcoin", "price": 67000.0, "coingecko_id": "bitcoin"},
        {"symbol": "ETH", "name": "Ethereum", "price": 3400.0, "coingecko_id": "ethereum"},
        {"symbol": "SOL", "name": "Solana", "price": 165.0, "coingecko_id": "solana"},
        {"symbol": "BNB", "name": "BNB", "price": 580.0, "coingecko_id": "binancecoin"},
        {"symbol": "USDC", "name": "USD Coin", "price": 1.0, "coingecko_id": "usd-coin"},
        {"symbol": "ADA", "name": "Cardano", "price": 0.45, "coingecko_id": "cardano"},
        {"symbol": "AVAX", "name": "Avalanche", "price": 35.0, "coingecko_id": "avalanche-2"},
        {"symbol": "MATIC", "name": "Polygon", "price": 0.85, "coingecko_id": "matic-network"},
        {"symbol": "DOT", "name": "Polkadot", "price": 8.5, "coingecko_id": "polkadot"},
        {"symbol": "LINK", "name": "Chainlink", "price": 14.0, "coingecko_id": "chainlink"},
    ]
    
    symbol_to_id = {}
    for c_data in coins_data:
        stmt = select(CoinModel).where(CoinModel.symbol == c_data["symbol"])
        result = await session.execute(stmt)
        coin = result.scalar_one_or_none()
        if not coin:
            coin = CoinModel(
                symbol=c_data["symbol"],
                name=c_data["name"],
                coingecko_id=c_data["coingecko_id"],
                is_active=True
            )
            session.add(coin)
            await session.flush()
        symbol_to_id[c_data["symbol"]] = coin.id

    # 3. Seed Price Ticks
    for c_data in coins_data:
        coin_id = symbol_to_id[c_data["symbol"]]
        # Check if we already have ticks
        stmt = select(PriceTickModel).where(PriceTickModel.coin_id == coin_id)
        result = await session.execute(stmt)
        if not result.scalars().first():
            tick = PriceTickModel(
                coin_id=coin_id,
                exchange_slug="aggregate",
                price_usd=c_data["price"],
                volume_24h=random.uniform(100_000_000, 1_000_000_000),
                price_change_24h=random.uniform(-5, 5),
                price_change_7d=random.uniform(-10, 10),
                market_cap=c_data["price"] * random.uniform(1_000_000, 10_000_000),
                recorded_at=datetime.now(timezone.utc)
            )
            session.add(tick)

    # 4. Seed 30 days daily OHLCV for BTC, ETH, SOL
    for symbol in ["BTC", "ETH", "SOL"]:
        coin_id = symbol_to_id[symbol]
        stmt = select(OHLCVCandleModel).where(OHLCVCandleModel.coin_id == coin_id)
        result = await session.execute(stmt)
        if not result.scalars().first():
            base_price = next(c["price"] for c in coins_data if c["symbol"] == symbol)
            current_time = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            
            last_price = base_price
            for i in range(30, 0, -1):
                open_time = current_time - timedelta(days=i)
                # Random walk
                change = random.uniform(-0.05, 0.05)
                open_p = last_price
                close_p = open_p * (1 + change)
                high_p = max(open_p, close_p) * (1 + random.uniform(0, 0.02))
                low_p = min(open_p, close_p) * (1 - random.uniform(0, 0.02))
                vol = random.uniform(10_000_000, 100_000_000)
                
                candle = OHLCVCandleModel(
                    coin_id=coin_id,
                    exchange_slug="aggregate",
                    interval="1d",
                    open_time=open_time,
                    open=open_p,
                    high=high_p,
                    low=low_p,
                    close=close_p,
                    volume=vol,
                    quote_volume=vol * close_p,
                    trade_count=int(vol / 1000)
                )
                session.add(candle)
                last_price = close_p
    
    await session.commit()
