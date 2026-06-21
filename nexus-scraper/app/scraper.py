"""
Core HTML scraper.

Fetches a URL with httpx, strips HTML to clean text via BeautifulSoup,
and extracts title + meta description.  Supports an optional SOCKS5 proxy
for .onion addresses (requires Tor running at the configured address).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class ScrapedPage:
    url: str
    title: str
    summary: str
    text: str
    links: list[str]
    is_onion: bool = False


async def scrape_url(url: str, *, via_tor: bool = False) -> ScrapedPage:
    """
    Fetch and parse a URL.

    - via_tor=True routes traffic through the SOCKS5 proxy configured in settings.
    - Raises httpx.HTTPError on network failures.
    - Raises ValueError for non-HTML content types.
    """
    settings = get_settings()
    parsed = urlparse(url)
    is_onion = parsed.netloc.endswith(".onion")

    transport = None
    if via_tor or is_onion:
        transport = httpx.AsyncHTTPTransport(
            proxy=f"socks5://{settings.tor_socks5_host}:{settings.tor_socks5_port}"
        )

    headers = {
        "User-Agent": (
            "NexusScraper/1.0 (https://github.com/itkdaniel/nexus-scraper)"
        ),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }

    async with httpx.AsyncClient(
        transport=transport,
        timeout=settings.scrape_timeout_s,
        follow_redirects=True,
        max_redirects=5,
    ) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        if "html" not in content_type and "xml" not in content_type:
            raise ValueError(
                f"Non-HTML content type: {content_type!r} — cannot extract text"
            )

        raw_html = resp.text[: settings.scrape_max_content_bytes]

    soup = BeautifulSoup(raw_html, "lxml")

    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "aside"]):
        tag.decompose()

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)
    if not title:
        title = parsed.netloc

    meta_desc = ""
    for meta in soup.find_all("meta"):
        name = meta.get("name", "").lower()
        prop = meta.get("property", "").lower()
        if name in ("description", "og:description") or prop in ("og:description",):
            meta_desc = meta.get("content", "").strip()
            break

    text_chunks: list[str] = []
    for tag in soup.find_all(["p", "h1", "h2", "h3", "h4", "li", "blockquote", "td"]):
        chunk = tag.get_text(separator=" ", strip=True)
        if len(chunk) > 30:
            text_chunks.append(chunk)

    clean_text = " ".join(text_chunks)
    if not clean_text:
        clean_text = soup.get_text(separator=" ", strip=True)

    links: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith("http"):
            links.append(href)
    links = list(dict.fromkeys(links))[:50]

    summary = meta_desc or (clean_text[:300] + "…" if len(clean_text) > 300 else clean_text)

    logger.info("Scraped %s — %d chars, %d links", url, len(clean_text), len(links))
    return ScrapedPage(
        url=url,
        title=title,
        summary=summary,
        text=clean_text,
        links=links,
        is_onion=is_onion,
    )
