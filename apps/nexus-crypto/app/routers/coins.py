from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

STATIC_PRICES = {
    "BTC": 67000.0,
    "ETH": 3400.0,
    "SOL": 165.0,
    "BNB": 580.0,
    "USDC": 1.0,
    "ADA": 0.45,
    "AVAX": 35.0,
    "MATIC": 0.85,
    "DOT": 8.5,
    "LINK": 14.0
}

COIN_NAMES = {
    "BTC": "Bitcoin",
    "ETH": "Ethereum",
    "SOL": "Solana",
    "BNB": "Binance Coin",
    "USDC": "USD Coin",
    "ADA": "Cardano",
    "AVAX": "Avalanche",
    "MATIC": "Polygon",
    "DOT": "Polkadot",
    "LINK": "Chainlink"
}

@router.get("/coins")
async def list_coins():
    return [
        {"symbol": sym, "name": COIN_NAMES.get(sym, sym)}
        for sym in STATIC_PRICES.keys()
    ]

@router.get("/prices")
async def get_all_prices():
    return [
        {"symbol": sym, "name": COIN_NAMES.get(sym, sym), "price": price}
        for sym, price in STATIC_PRICES.items()
    ]

@router.get("/prices/{symbol}")
async def get_price(symbol: str):
    symbol = symbol.upper()
    if symbol not in STATIC_PRICES:
        return {"error": "Coin not found", "symbol": symbol}
    return {
        "symbol": symbol,
        "name": COIN_NAMES.get(symbol, symbol),
        "price": STATIC_PRICES[symbol]
    }
