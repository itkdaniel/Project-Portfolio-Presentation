"""
Core HTML scraper.

Fetches a URL with httpx, strips HTML to clean text via BeautifulSoup,
and extracts title + meta description.  Supports an optional SOCKS5 proxy
for .onion addresses (requires Tor running at the configured address).

SSRF protection
---------------
Before any outbound HTTP request we validate the target URL against a
strict allow/deny policy:
  - Only http:// and https:// schemes are permitted (plus .onion via Tor)
  - DNS resolution is performed up-front; the resolved IP is checked against
    RFC1918, loopback, link-local, multicast, and other reserved ranges
  - Every redirect target is re-validated in the same way
"""
from __future__ import annotations

import ipaddress
import logging
import socket
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── SSRF guard ────────────────────────────────────────────────────────────────

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),          # "this" network
    ipaddress.ip_network("10.0.0.0/8"),          # RFC 1918 private
    ipaddress.ip_network("100.64.0.0/10"),        # Shared address space
    ipaddress.ip_network("127.0.0.0/8"),          # Loopback
    ipaddress.ip_network("169.254.0.0/16"),       # Link-local / AWS metadata
    ipaddress.ip_network("172.16.0.0/12"),        # RFC 1918 private
    ipaddress.ip_network("192.0.0.0/24"),         # IETF protocol assignments
    ipaddress.ip_network("192.168.0.0/16"),       # RFC 1918 private
    ipaddress.ip_network("198.18.0.0/15"),        # Benchmarking
    ipaddress.ip_network("198.51.100.0/24"),      # TEST-NET-2
    ipaddress.ip_network("203.0.113.0/24"),       # TEST-NET-3
    ipaddress.ip_network("224.0.0.0/4"),          # Multicast
    ipaddress.ip_network("240.0.0.0/4"),          # Reserved
    ipaddress.ip_network("255.255.255.255/32"),   # Broadcast
    # IPv6 equivalents
    ipaddress.ip_network("::1/128"),              # Loopback
    ipaddress.ip_network("fc00::/7"),             # Unique local
    ipaddress.ip_network("fe80::/10"),            # Link-local
    ipaddress.ip_network("::/128"),               # Unspecified
]


def _is_ip_blocked(ip_str: str) -> bool:
    """Return True if the IP address falls within a blocked private/reserved range."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # unparseable → block
    return any(addr in net for net in _BLOCKED_NETWORKS)


def validate_url_for_fetch(url: str, *, allow_onion: bool = False) -> None:
    """
    Validate a URL before fetching.

    Raises ValueError with a descriptive message if the URL is unsafe.
    Does NOT follow redirects — call again on each redirect target.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise ValueError(
            f"Scheme '{parsed.scheme}' not allowed — only http/https are permitted"
        )

    hostname = parsed.hostname or ""
    if not hostname:
        raise ValueError("URL has no hostname")

    # .onion addresses are never resolved via system DNS
    if hostname.endswith(".onion"):
        if not allow_onion:
            raise ValueError(
                ".onion URLs must be fetched via the /v1/scrape/onion endpoint"
            )
        return  # Tor handles DNS for .onion — skip IP resolution

    # Reject bare IPv4/IPv6 literals in the blocked ranges immediately
    try:
        literal_addr = ipaddress.ip_address(hostname)
        if _is_ip_blocked(str(literal_addr)):
            raise ValueError(
                f"URL target '{hostname}' resolves to a private/reserved address — "
                "SSRF protection blocked this request"
            )
        return
    except ValueError as exc:
        # If the ValueError came from our own block check, re-raise it
        if "SSRF" in str(exc) or "resolves" in str(exc):
            raise
        # Otherwise hostname is not an IP literal — fall through to DNS

    # DNS resolution → validate every returned address
    try:
        results = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ValueError(f"DNS resolution failed for '{hostname}': {exc}") from exc

    for res in results:
        ip_str = res[4][0]
        if _is_ip_blocked(ip_str):
            raise ValueError(
                f"URL target '{hostname}' resolves to '{ip_str}' which is a "
                "private/reserved address — SSRF protection blocked this request"
            )


class _SsrfSafeTransport(httpx.AsyncHTTPTransport):
    """
    HTTPx transport that re-validates the resolved destination before each
    connection attempt, blocking late SSRF via open redirects.
    """

    def __init__(self, *args, allow_onion: bool = False, **kwargs):
        super().__init__(*args, **kwargs)
        self._allow_onion = allow_onion

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        validate_url_for_fetch(str(request.url), allow_onion=self._allow_onion)
        return await super().handle_async_request(request)


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

    - Validates the URL against SSRF protection before any network call.
    - Every redirect target is re-validated by _SsrfSafeTransport.
    - via_tor=True routes traffic through the SOCKS5 proxy configured in settings.
    - Raises ValueError for disallowed URLs or non-HTML content types.
    - Raises httpx.HTTPError on network failures.
    """
    settings = get_settings()
    parsed = urlparse(url)
    is_onion = parsed.netloc.endswith(".onion")

    # ── SSRF guard (pre-flight) ───────────────────────────────────────────────
    # Validate before opening any connection; _SsrfSafeTransport re-validates
    # on every redirect hop as well.
    validate_url_for_fetch(url, allow_onion=(via_tor or is_onion))

    if via_tor or is_onion:
        transport = httpx.AsyncHTTPTransport(
            proxy=f"socks5://{settings.tor_socks5_host}:{settings.tor_socks5_port}"
        )
    else:
        transport = _SsrfSafeTransport(allow_onion=False)

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
