"""
Integration-style tests for entity and scrape API routes using FastAPI TestClient.
Database calls are mocked so no live PostgreSQL connection is required.
"""
from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app():
    with patch("app.database.init_db"), patch("app.database.close_db"):
        from app.main import create_app
        application = create_app()
    return application


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def _make_entity(**kwargs):
    defaults = dict(
        id="ent-1",
        type="Technology",
        title="FastAPI",
        summary="A modern Python web framework.",
        source_url="https://fastapi.tiangolo.com",
        source_label="Hacker News",
        raw_content="FastAPI is a modern, fast web framework.",
        embedding=[0.1] * 64,
        confidence=0.87,
        trend_score=1.0,
        scraped_at=datetime(2025, 1, 1, 12, 0),
        classified_at=datetime(2025, 1, 1, 12, 0, 5),
        relations_from=[],
    )
    defaults.update(kwargs)
    m = MagicMock()
    for k, v in defaults.items():
        setattr(m, k, v)
    return m


def _make_job(**kwargs):
    defaults = dict(
        id="job-1",
        target_url="https://fastapi.tiangolo.com",
        status="completed",
        entity_count=1,
        error_message=None,
        started_at=datetime(2025, 1, 1, 12, 0),
        completed_at=datetime(2025, 1, 1, 12, 0, 10),
    )
    defaults.update(kwargs)
    m = MagicMock()
    for k, v in defaults.items():
        setattr(m, k, v)
    return m


def test_health_endpoint(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "nexus-scraper"
    assert "version" in data
    assert "uptime" in data


def test_info_endpoint(client):
    resp = client.get("/info")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "NexusScraper"
    assert isinstance(data["endpoints"], list)
    paths = [e["path"] for e in data["endpoints"]]
    assert "/v1/scrape/url" in paths
    assert "/v1/entities" in paths
    assert "/v1/entity-types" in paths


def _mock_session():
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)
    session.commit = AsyncMock()
    session.flush = AsyncMock()
    session.rollback = AsyncMock()
    return session


def test_list_entity_types(client):
    et1 = MagicMock(id=1, name="Technology", color="#06b6d4", description="Tech stuff")
    et2 = MagicMock(id=2, name="Person",     color="#3b82f6", description="A person")

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [et1, et2]

    session = _mock_session()
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.routers.entities.get_session", return_value=_gen_session(session)):
        resp = client.get("/v1/entity-types")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    names = [d["name"] for d in data]
    assert "Technology" in names
    assert "Person" in names


def _gen_session(session):
    async def _gen():
        yield session
    return _gen()


def test_get_entity_not_found(client):
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    session = _mock_session()
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.routers.entities.get_session", return_value=_gen_session(session)):
        resp = client.get("/v1/entities/nonexistent-id")

    assert resp.status_code == 404


def test_get_job_not_found(client):
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    session = _mock_session()
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.routers.scrape.get_session", return_value=_gen_session(session)):
        resp = client.get("/v1/scrape/jobs/nonexistent-id")

    assert resp.status_code == 404


def test_list_jobs_empty(client):
    count_result = MagicMock()
    count_result.scalar_one.return_value = 0
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = []

    call_count = 0

    async def _execute(_stmt):
        nonlocal call_count
        call_count += 1
        return count_result if call_count == 1 else list_result

    session = _mock_session()
    session.execute = _execute

    with patch("app.routers.scrape.get_session", return_value=_gen_session(session)):
        resp = client.get("/v1/scrape/jobs")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []
