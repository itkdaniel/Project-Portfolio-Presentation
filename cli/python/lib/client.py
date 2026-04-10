"""
Async + sync HTTP client for the NexusConsult REST API.
Uses httpx for both sync (CLI calls) and async (parallel batch requests).
"""

from __future__ import annotations

import asyncio
import sys
from typing import Any, Optional

import httpx

from . import config as cfg


def _headers(extra: dict | None = None) -> dict:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    tok = cfg.token()
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    if extra:
        h.update(extra)
    return h


def _base() -> str:
    return cfg.api_url().rstrip("/")


def _handle(resp: httpx.Response) -> Any:
    """Raise on HTTP error, otherwise return parsed JSON."""
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json()
        except Exception:
            detail = exc.response.text
        raise APIError(exc.response.status_code, detail) from exc
    try:
        return resp.json()
    except Exception:
        return resp.text


class APIError(Exception):
    def __init__(self, status: int, detail: Any):
        self.status  = status
        self.detail  = detail
        msg = f"HTTP {status}: {detail}"
        super().__init__(msg)


# ── Sync client (used by most CLI commands) ───────────────────────────────────

def get(path: str, params: dict | None = None) -> Any:
    with httpx.Client(base_url=_base(), timeout=30) as c:
        return _handle(c.get(path, params=params, headers=_headers()))


def post(path: str, body: dict | None = None) -> Any:
    with httpx.Client(base_url=_base(), timeout=30) as c:
        return _handle(c.post(path, json=body, headers=_headers()))


def patch(path: str, body: dict | None = None) -> Any:
    with httpx.Client(base_url=_base(), timeout=30) as c:
        return _handle(c.patch(path, json=body, headers=_headers()))


def delete(path: str) -> Any:
    with httpx.Client(base_url=_base(), timeout=30) as c:
        return _handle(c.delete(path, headers=_headers()))


# ── Async client (parallel batch requests) ───────────────────────────────────

async def async_get_many(paths: list[str]) -> list[Any]:
    """Fetch multiple endpoints in parallel and return results in order."""
    async with httpx.AsyncClient(base_url=_base(), timeout=30) as c:
        tasks = [c.get(p, headers=_headers()) for p in paths]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
    results = []
    for r in responses:
        if isinstance(r, Exception):
            results.append({"error": str(r)})
        else:
            try:
                r.raise_for_status()
                results.append(r.json())
            except Exception as e:
                results.append({"error": str(e)})
    return results


def parallel_get(paths: list[str]) -> list[Any]:
    """Sync wrapper around async_get_many — runs in a new event loop."""
    return asyncio.run(async_get_many(paths))
