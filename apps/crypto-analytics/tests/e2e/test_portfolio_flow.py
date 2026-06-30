"""
E2E tests for portfolio analytics endpoints (snapshot, timeseries, performance, breakdown).
Uses aiosqlite in-memory DB via conftest fixtures.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

ASSETS = [
    {"coin_symbol": "BTC",  "quantity": 0.5, "price_usd": 67000, "cost_basis": 60000},
    {"coin_symbol": "ETH",  "quantity": 3.2, "price_usd": 3400,  "cost_basis": 3000},
    {"coin_symbol": "SOL",  "quantity": 50,  "price_usd": 165,   "cost_basis": 140},
    {"coin_symbol": "USDC", "quantity": 5000,"price_usd": 1.0,   "cost_basis": 1.0},
]

SNAPSHOT_PAYLOAD = {
    "user_id": "test-user-e2e",
    "portfolio_id": "main",
    "assets": ASSETS,
    "realized_pnl": 0.0,
}


@pytest.mark.asyncio
async def test_record_snapshot(client: AsyncClient):
    resp = await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["user_id"] == "test-user-e2e"
    assert data["portfolio_id"] == "main"
    assert data["total_value_usd"] > 0
    assert data["total_cost_basis"] > 0
    assert len(data["assets"]) == len(ASSETS)


@pytest.mark.asyncio
async def test_snapshot_pnl_computed_correctly(client: AsyncClient):
    resp = await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    expected_value = sum(a["quantity"] * a["price_usd"] for a in ASSETS)
    expected_cost = sum(a["quantity"] * a["cost_basis"] for a in ASSETS)
    assert abs(data["total_value_usd"] - expected_value) < 0.01
    assert abs(data["total_cost_basis"] - expected_cost) < 0.01
    assert abs(data["unrealized_pnl"] - (expected_value - expected_cost)) < 0.01


@pytest.mark.asyncio
async def test_list_snapshots_empty(client: AsyncClient):
    resp = await client.get("/v1/analytics/portfolio/snapshots?user_id=nonexistent-user")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_snapshots_after_insert(client: AsyncClient):
    await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    resp = await client.get("/v1/analytics/portfolio/snapshots?user_id=test-user-e2e&portfolio_id=main")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2


@pytest.mark.asyncio
async def test_timeseries_empty_user(client: AsyncClient):
    resp = await client.get("/v1/analytics/portfolio/timeseries?user_id=no-such-user")
    assert resp.status_code == 200
    data = resp.json()
    assert data["dates"] == []
    assert data["values"] == []


@pytest.mark.asyncio
async def test_timeseries_after_snapshots(client: AsyncClient):
    for _ in range(3):
        await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    resp = await client.get("/v1/analytics/portfolio/timeseries?user_id=test-user-e2e&portfolio_id=main")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["dates"]) >= 3
    assert len(data["values"]) == len(data["dates"])
    assert len(data["pnl"]) == len(data["dates"])


@pytest.mark.asyncio
async def test_performance_404_no_data(client: AsyncClient):
    resp = await client.get("/v1/analytics/portfolio/performance?user_id=ghost-user")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_performance_after_snapshots(client: AsyncClient):
    for _ in range(5):
        await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    resp = await client.get("/v1/analytics/portfolio/performance?user_id=test-user-e2e&portfolio_id=main")
    assert resp.status_code == 200
    data = resp.json()
    assert "sharpe_ratio" in data
    assert "max_drawdown_pct" in data
    assert "volatility_30d_pct" in data
    assert "total_return_pct" in data
    assert data["snapshot_count"] >= 5


@pytest.mark.asyncio
async def test_breakdown_404_no_data(client: AsyncClient):
    resp = await client.get("/v1/analytics/portfolio/breakdown?user_id=ghost-user")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_breakdown_after_snapshot(client: AsyncClient):
    await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    resp = await client.get("/v1/analytics/portfolio/breakdown?user_id=test-user-e2e&portfolio_id=main")
    assert resp.status_code == 200
    data = resp.json()
    assert "assets" in data
    assert len(data["assets"]) == len(ASSETS)
    assert data["total_value_usd"] > 0
    symbols = {a["coin_symbol"] for a in data["assets"]}
    assert symbols == {"BTC", "ETH", "SOL", "USDC"}


@pytest.mark.asyncio
async def test_asset_weights_sum_to_100(client: AsyncClient):
    await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    resp = await client.get("/v1/analytics/portfolio/breakdown?user_id=test-user-e2e&portfolio_id=main")
    assert resp.status_code == 200
    assets = resp.json()["assets"]
    total_weight = sum(a["weight_pct"] for a in assets)
    assert abs(total_weight - 100.0) < 0.1


@pytest.mark.asyncio
async def test_snapshot_limit_param(client: AsyncClient):
    for _ in range(10):
        await client.post("/v1/analytics/portfolio/snapshot", json=SNAPSHOT_PAYLOAD)
    resp = await client.get("/v1/analytics/portfolio/snapshots?user_id=test-user-e2e&portfolio_id=main&limit=5")
    assert resp.status_code == 200
    assert len(resp.json()) <= 5
