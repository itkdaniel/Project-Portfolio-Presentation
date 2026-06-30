# Crypto Market Service

Real-time (simulated) cryptocurrency market data service for the NexusCrypto ecosystem.

## Features
- Coin metadata and listing
- Real-time price ticks (simulated aggregate)
- OHLCV candlestick data
- Exchange metadata

## API Endpoints
- `GET /v1/market/coins`: List all active coins
- `GET /v1/market/prices`: Latest price for all coins
- `GET /v1/market/candles/{symbol}`: Historical OHLCV data
- `GET /v1/market/exchanges`: List supported exchanges

## Development
Port: 8101
Database: PostgreSQL (asyncpg)
Tests: pytest with aiosqlite in-memory
