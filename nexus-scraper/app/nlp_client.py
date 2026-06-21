"""
Async NLP client that calls the NexusAI service for classification + embeddings.

Falls back to a lightweight heuristic classifier when NEXUS_AI_URL is
unreachable, so scraping continues to work in development without a
running AI service.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Heuristic fallback classifier ────────────────────────────────────────────

_KEYWORD_MAP: list[tuple[str, list[str]]] = [
    ("Person",       ["ceo", "founder", "engineer", "researcher", "author", "developer", "scientist"]),
    ("Organization", ["company", "corp", "inc", "ltd", "foundation", "institute", "university", "team"]),
    ("Technology",   ["python", "javascript", "typescript", "rust", "go", "kubernetes", "docker", "react",
                      "api", "database", "framework", "library", "language", "protocol", "algorithm"]),
    ("Concept",      ["pattern", "architecture", "methodology", "principle", "theory", "approach", "design"]),
    ("Event",        ["conference", "summit", "meetup", "release", "launch", "incident", "outage", "announcement"]),
    ("Location",     ["city", "country", "region", "datacenter", "zone", "cloud", "aws", "gcp", "azure"]),
    ("Product",      ["saas", "platform", "app", "tool", "service", "product", "suite", "dashboard"]),
    ("Article",      ["post", "blog", "article", "tutorial", "guide", "how-to", "writeup", "paper", "study"]),
    ("Repository",   ["github", "gitlab", "repo", "repository", "commit", "pull request", "fork", "star"]),
    ("Dataset",      ["dataset", "corpus", "benchmark", "data", "csv", "json", "training set", "collection"]),
]


def _heuristic_classify(text: str) -> tuple[str, float]:
    lower = text.lower()
    scores: list[tuple[str, int]] = []
    for entity_type, keywords in _KEYWORD_MAP:
        count = sum(1 for kw in keywords if kw in lower)
        scores.append((entity_type, count))
    scores.sort(key=lambda x: x[1], reverse=True)
    best_type, best_count = scores[0]
    total = sum(c for _, c in scores) or 1
    confidence = min(0.95, best_count / total + 0.1) if best_count > 0 else 0.1
    return best_type, round(confidence, 4)


def _heuristic_embed(text: str, dim: int = 64) -> list[float]:
    tokens = text.lower().split()
    vec = [0.0] * dim
    for token in tokens:
        h = 5381
        for ch in token:
            h = ((h << 5) + h) ^ ord(ch)
            h &= 0x7FFFFFFF
        vec[h % dim] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]


# ── NexusAI API client ────────────────────────────────────────────────────────

@dataclass
class NlpResult:
    entity_type: str
    confidence: float
    embedding: list[float]


async def classify_and_embed(title: str, text: str) -> NlpResult:
    """
    Call NexusAI /v1/ai/classify and /v1/ai/embed.
    Falls back to heuristic methods on any error.
    """
    settings = get_settings()
    snippet = (title + " " + text)[:2000]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            classify_resp, embed_resp = await _parallel_requests(
                client,
                settings.nexus_ai_url,
                snippet,
            )

        entity_type = classify_resp.get("label", "Article")
        confidence  = float(classify_resp.get("confidence", 0.5))

        embed_vec = embed_resp.get("embedding", [])
        if not embed_vec:
            embed_vec = _heuristic_embed(snippet)

        logger.debug("NexusAI classified %r → %s (%.2f)", title[:50], entity_type, confidence)
        return NlpResult(entity_type=entity_type, confidence=confidence, embedding=embed_vec)

    except Exception as exc:
        logger.warning("NexusAI unavailable (%s) — using heuristic fallback", exc)
        entity_type, confidence = _heuristic_classify(snippet)
        embedding = _heuristic_embed(snippet)
        return NlpResult(entity_type=entity_type, confidence=confidence, embedding=embedding)


async def _parallel_requests(
    client: httpx.AsyncClient,
    base_url: str,
    text: str,
) -> tuple[dict, dict]:
    import asyncio

    async def _classify() -> dict:
        r = await client.post(f"{base_url}/v1/ai/classify", json={"text": text})
        r.raise_for_status()
        return r.json()

    async def _embed() -> dict:
        r = await client.post(f"{base_url}/v1/ai/embed", json={"text": text})
        r.raise_for_status()
        return r.json()

    classify_data, embed_data = await asyncio.gather(_classify(), _embed())
    return classify_data, embed_data
