# Nexus Crypto Portal

FastAPI microservice for cryptocurrency portfolio management, watchlists, and basic market data.

## Features
- JWT Authentication (custom HMAC implementation)
- Portfolio tracking with USD value and PnL
- Watchlist management
- Static market prices for 10 major assets

## API Endpoints
- `POST /v1/crypto/auth/register`
- `POST /v1/crypto/auth/login`
- `GET /v1/crypto/auth/me`
- `GET /v1/crypto/coins`
- `GET /v1/crypto/portfolio`
- `GET /v1/crypto/watchlist`

## Development
```bash
pip install -e ".[dev]"
pytest
```
