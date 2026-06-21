"""
Unit tests for the NexusScraper scrape pipeline.
httpx and NexusAI calls are mocked so no network access is required.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── scraper.py ───────────────────────────────────────────────────────────────

SAMPLE_HTML = """<!DOCTYPE html>
<html>
<head>
  <title>Test Article — NexusScraper</title>
  <meta name="description" content="A test article about Python and FastAPI."/>
</head>
<body>
  <h1>Python FastAPI Tutorial</h1>
  <p>This is a comprehensive guide to building async APIs with FastAPI and Python.</p>
  <p>We cover dependency injection, async SQLAlchemy, and Pydantic schemas.</p>
  <a href="https://example.com/related">Related article</a>
</body>
</html>"""


@pytest.mark.asyncio
async def test_scrape_url_returns_scraped_page():
    mock_response = MagicMock()
    mock_response.text = SAMPLE_HTML
    mock_response.headers = {"content-type": "text/html; charset=utf-8"}
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("app.scraper.httpx.AsyncClient", return_value=mock_client):
        from app.scraper import scrape_url
        page = await scrape_url("https://example.com/article")

    assert page.title == "Test Article — NexusScraper"
    assert "FastAPI" in page.text
    assert page.summary == "A test article about Python and FastAPI."
    assert "https://example.com/related" in page.links
    assert not page.is_onion


@pytest.mark.asyncio
async def test_scrape_url_raises_on_non_html():
    mock_response = MagicMock()
    mock_response.text = b"\x89PNG\r\n"
    mock_response.headers = {"content-type": "image/png"}
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("app.scraper.httpx.AsyncClient", return_value=mock_client):
        from app.scraper import scrape_url
        with pytest.raises(ValueError, match="Non-HTML content type"):
            await scrape_url("https://example.com/image.png")


@pytest.mark.asyncio
async def test_scrape_onion_sets_is_onion_flag():
    mock_response = MagicMock()
    mock_response.text = "<html><head><title>Onion Site</title></head><body><p>Hidden service content.</p></body></html>"
    mock_response.headers = {"content-type": "text/html"}
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("app.scraper.httpx.AsyncClient", return_value=mock_client):
        with patch("app.scraper.httpx.AsyncHTTPTransport"):
            from app.scraper import scrape_url
            page = await scrape_url("http://test1234.onion/")

    assert page.is_onion is True
    assert page.title == "Onion Site"


# ── SSRF protection ───────────────────────────────────────────────────────────

def test_validate_url_blocks_loopback():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="private/reserved|loopback|SSRF"):
        validate_url_for_fetch("http://127.0.0.1/secret")


def test_validate_url_blocks_localhost():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError):
        validate_url_for_fetch("http://localhost/admin")


def test_validate_url_blocks_rfc1918_10():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="private/reserved|SSRF"):
        validate_url_for_fetch("http://10.0.0.1/internal")


def test_validate_url_blocks_rfc1918_172():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="private/reserved|SSRF"):
        validate_url_for_fetch("http://172.16.0.1/")


def test_validate_url_blocks_rfc1918_192():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="private/reserved|SSRF"):
        validate_url_for_fetch("http://192.168.1.1/router")


def test_validate_url_blocks_aws_metadata():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="private/reserved|SSRF"):
        validate_url_for_fetch("http://169.254.169.254/latest/meta-data/")


def test_validate_url_blocks_ipv6_loopback():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="private/reserved|SSRF"):
        validate_url_for_fetch("http://[::1]/")


def test_validate_url_blocks_non_http_scheme():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="Scheme"):
        validate_url_for_fetch("file:///etc/passwd")


def test_validate_url_blocks_ftp_scheme():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="Scheme"):
        validate_url_for_fetch("ftp://example.com/file")


def test_validate_url_blocks_onion_without_flag():
    from app.scraper import validate_url_for_fetch
    import pytest
    with pytest.raises(ValueError, match="onion"):
        validate_url_for_fetch("http://hidden.onion/page")


def test_validate_url_allows_onion_with_flag():
    from app.scraper import validate_url_for_fetch
    # Should not raise
    validate_url_for_fetch("http://hidden.onion/page", allow_onion=True)


def test_is_ip_blocked_loopback():
    from app.scraper import _is_ip_blocked
    assert _is_ip_blocked("127.0.0.1") is True
    assert _is_ip_blocked("127.255.255.255") is True


def test_is_ip_blocked_private_ranges():
    from app.scraper import _is_ip_blocked
    assert _is_ip_blocked("10.10.10.10") is True
    assert _is_ip_blocked("172.16.100.1") is True
    assert _is_ip_blocked("192.168.0.1") is True
    assert _is_ip_blocked("169.254.169.254") is True


def test_is_ip_blocked_public_addresses():
    from app.scraper import _is_ip_blocked
    assert _is_ip_blocked("8.8.8.8") is False
    assert _is_ip_blocked("1.1.1.1") is False
    assert _is_ip_blocked("151.101.1.140") is False


# ── nlp_client.py ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_classify_and_embed_uses_heuristic_on_failure():
    with patch("app.nlp_client.httpx.AsyncClient") as mock_cls:
        mock_cls.side_effect = Exception("Connection refused")
        from app.nlp_client import classify_and_embed
        result = await classify_and_embed("Python FastAPI framework", "Build async APIs fast.")

    assert result.entity_type in {
        "Person", "Organization", "Technology", "Concept", "Event",
        "Location", "Product", "Article", "Repository", "Dataset",
    }
    assert 0.0 <= result.confidence <= 1.0
    assert len(result.embedding) > 0


@pytest.mark.asyncio
async def test_classify_and_embed_uses_nexusai_when_available():
    mock_classify = {"label": "Technology", "confidence": 0.91}
    mock_embed    = {"embedding": [0.1] * 64}

    async def _mock_post(url, **kwargs):
        m = MagicMock()
        m.raise_for_status = MagicMock()
        if "classify" in url:
            m.json = MagicMock(return_value=mock_classify)
        else:
            m.json = MagicMock(return_value=mock_embed)
        return m

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = _mock_post

    with patch("app.nlp_client.httpx.AsyncClient", return_value=mock_client):
        from app.nlp_client import classify_and_embed
        result = await classify_and_embed("Kubernetes orchestration", "Deploy containers at scale.")

    assert result.entity_type == "Technology"
    assert result.confidence == 0.91
    assert result.embedding == [0.1] * 64


def test_heuristic_classify_keywords():
    from app.nlp_client import _heuristic_classify
    etype, conf = _heuristic_classify("CEO founder researcher author developer scientist")
    assert etype == "Person"
    assert conf > 0.1


def test_heuristic_embed_returns_normalized_vector():
    from app.nlp_client import _heuristic_embed
    import math
    vec = _heuristic_embed("machine learning transformer model", dim=64)
    assert len(vec) == 64
    norm = math.sqrt(sum(v * v for v in vec))
    assert abs(norm - 1.0) < 0.01


# ── trending.py ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fetch_hn_top_urls_returns_list():
    hn_response = [1, 2, 3]
    story_1 = {"url": "https://example.com/story1", "title": "Story One", "type": "story"}
    story_2 = {"url": "https://example.com/story2", "title": "Story Two", "type": "story"}
    story_3 = {"url": "", "title": "Ask HN: no url", "type": "ask"}

    async def _mock_get(url, **kwargs):
        m = MagicMock()
        m.raise_for_status = MagicMock()
        if "topstories" in url:
            m.json = MagicMock(return_value=hn_response)
        elif "/1.json" in url:
            m.json = MagicMock(return_value=story_1)
        elif "/2.json" in url:
            m.json = MagicMock(return_value=story_2)
        else:
            m.json = MagicMock(return_value=story_3)
        return m

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = _mock_get

    with patch("app.trending.httpx.AsyncClient", return_value=mock_client):
        from app.trending import fetch_hn_top_urls
        results = await fetch_hn_top_urls(count=3)

    assert len(results) == 2
    urls = [r[0] for r in results]
    assert "https://example.com/story1" in urls
    assert "https://example.com/story2" in urls
