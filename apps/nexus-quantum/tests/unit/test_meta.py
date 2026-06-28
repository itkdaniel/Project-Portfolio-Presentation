"""
Unit tests for /health and /info meta endpoints.
"""
from __future__ import annotations

import pytest


@pytest.mark.unit
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "nexus-quantum"
    assert "version" in data
    assert "uptime" in data
    assert "azure_connected" in data
    assert data["azure_connected"] is False


@pytest.mark.unit
async def test_info(client):
    resp = await client.get("/info")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "nexus-quantum"
    assert data["port"] == 8200
    assert isinstance(data["endpoints"], list)
    assert len(data["endpoints"]) >= 14
    paths = [e["path"] for e in data["endpoints"]]
    assert "/v1/quantum/jobs" in paths
    assert "/v1/quantum/simulate" in paths
    assert "/v1/quantum/optimize/portfolio" in paths
    assert "/v1/quantum/circuits" in paths
