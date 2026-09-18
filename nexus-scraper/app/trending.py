"""
Trending scraper — fetches top articles from Hacker News and Reddit,
deduplicates by SHA-256 URL hash, and dispatches to the scrape pipeline.

APScheduler runs this every 6 hours automatically when the app starts.
Manual trigger: POST /v1/scrape/trending
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.entity import EntityORM, ScrapeJobORM
from app.nlp_client import classify_and_embed
from app.scraper import scrape_url

logger = logging.getLogger(__name__)

# Transaction-scoped PostgreSQL advisory lock shared by every scraper replica.
# This prevents CronJob retries and manual triggers from crawling concurrently.
_TRENDING_SCRAPE_LOCK_ID = 5_349_435_267_273_826_289


def _url_hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


async def _url_already_scraped(session: AsyncSession, url: str) -> bool:
    stmt = select(EntityORM).where(EntityORM.source_url == url).limit(1)
    result = await session.execute(stmt)
    return result.scalar_one_or_none() is not None


async def fetch_hn_top_urls(count: int = 30) -> list[tuple[str, str]]:
    """Return list of (url, title) for top HN stories."""
    results: list[tuple[str, str]] = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get("https://hacker-news.firebaseio.com/v0/topstories.json")
        resp.raise_for_status()
        story_ids: list[int] = resp.json()[:count]

        async def _fetch_item(sid: int) -> Optional[tuple[str, str]]:
            try:
                r = await client.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json")
                r.raise_for_status()
                item = r.json()
                url = item.get("url", "")
                title = item.get("title", "")
                if url and url.startswith("http"):
                    return url, title
            except Exception:
                return None
            return None

        tasks = [_fetch_item(sid) for sid in story_ids]
        items = await asyncio.gather(*tasks)
        results = [i for i in items if i is not None]

    logger.info("Fetched %d HN stories", len(results))
    return results


async def fetch_reddit_top_urls(subreddit: str = "technology", count: int = 20) -> list[tuple[str, str]]:
    """Return list of (url, title) for top Reddit posts."""
    results: list[tuple[str, str]] = []
    url = f"https://www.reddit.com/r/{subreddit}/top.json?limit={count}&t=day"
    async with httpx.AsyncClient(
        timeout=10.0,
        headers={"User-Agent": "NexusScraper/1.0"},
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
        for post in data.get("data", {}).get("children", []):
            post_data = post.get("data", {})
            post_url = post_data.get("url", "")
            title = post_data.get("title", "")
            if post_url and post_url.startswith("http") and "reddit.com" not in post_url:
                results.append((post_url, title))
    logger.info("Fetched %d Reddit /%s stories", len(results), subreddit)
    return results


async def run_trending_scrape(session: AsyncSession) -> dict:
    """
    Fetch trending URLs from HN + Reddit, deduplicate, scrape + classify each.
    Returns a summary dict with counts.
    """
    settings = get_settings()
    scraped = 0
    skipped = 0
    errors = 0

    lock_result = await session.execute(
        text("SELECT pg_try_advisory_xact_lock(:lock_id)"),
        {"lock_id": _TRENDING_SCRAPE_LOCK_ID},
    )
    if not lock_result.scalar():
        logger.info("Skipping trending scrape because another run holds the lock")
        return {
            "scraped": 0,
            "skipped": 0,
            "errors": 0,
            "total": 0,
        }

    try:
        hn_items = await fetch_hn_top_urls(settings.trending_hn_count)
    except Exception as exc:
        logger.error("Failed to fetch HN stories: %s", exc)
        hn_items = []

    try:
        reddit_items = await fetch_reddit_top_urls("technology", settings.trending_reddit_count)
    except Exception as exc:
        logger.error("Failed to fetch Reddit stories: %s", exc)
        reddit_items = []

    all_items = hn_items + reddit_items
    seen_hashes: set[str] = set()
    unique_items: list[tuple[str, str, str]] = []
    for url, title in all_items:
        h = _url_hash(url)
        if h not in seen_hashes:
            seen_hashes.add(h)
            label = "Hacker News" if (url, title) in hn_items else "Reddit /r/technology"
            unique_items.append((url, title, label))

    for url, hint_title, source_label in unique_items:
        if await _url_already_scraped(session, url):
            skipped += 1
            continue

        job = ScrapeJobORM(target_url=url, status="running")
        session.add(job)
        await session.flush()

        try:
            page = await scrape_url(url)
            nlp = await classify_and_embed(
                hint_title or page.title,
                page.text[:3000],
            )
            entity = EntityORM(
                type=nlp.entity_type,
                title=hint_title or page.title,
                summary=page.summary,
                source_url=url,
                source_label=source_label,
                raw_content=page.text[:8000],
                embedding=nlp.embedding,
                confidence=nlp.confidence,
                trend_score=1.0,
                classified_at=datetime.utcnow(),
            )
            session.add(entity)

            job.status = "completed"
            job.entity_count = 1
            job.completed_at = datetime.utcnow()
            scraped += 1

        except Exception as exc:
            logger.warning("Failed to scrape %s: %s", url, exc)
            job.status = "failed"
            job.error_message = str(exc)[:500]
            job.completed_at = datetime.utcnow()
            errors += 1

        await session.flush()

    await session.commit()
    logger.info(
        "Trending scrape done — scraped=%d, skipped=%d, errors=%d",
        scraped, skipped, errors,
    )
    return {"scraped": scraped, "skipped": skipped, "errors": errors, "total": len(unique_items)}
