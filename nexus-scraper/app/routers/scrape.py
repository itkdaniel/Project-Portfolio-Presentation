"""
Scrape API routes.

POST /v1/scrape/url       — scrape a single URL
POST /v1/scrape/onion     — scrape a .onion URL via Tor SOCKS5
GET  /v1/scrape/jobs      — list recent scrape jobs (paginated)
GET  /v1/scrape/jobs/:id  — single job detail with entities
POST /v1/scrape/trending  — trigger a trending scrape run
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, HttpUrl
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.entity import EntityORM, ScrapeJobORM
from app.nlp_client import classify_and_embed
from app.scraper import scrape_url, validate_url_for_fetch
from app.trending import run_trending_scrape

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/scrape", tags=["scrape"])


class ScrapeRequest(BaseModel):
    url: str
    source_label: Optional[str] = None


class ScrapeResponse(BaseModel):
    job_id: str
    status: str
    entity_id: Optional[str] = None
    entity_type: Optional[str] = None
    title: Optional[str] = None
    confidence: Optional[float] = None
    message: str = ""


class JobOut(BaseModel):
    id: str
    target_url: str
    status: str
    entity_count: int
    error_message: Optional[str]
    started_at: str
    completed_at: Optional[str]


class JobDetailOut(JobOut):
    entities: list[dict] = []


class PaginatedJobs(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[JobOut]


class TrendingResponse(BaseModel):
    scraped: int
    skipped: int
    errors: int
    total: int
    message: str


def _job_out(job: ScrapeJobORM) -> JobOut:
    return JobOut(
        id=job.id,
        target_url=job.target_url,
        status=job.status,
        entity_count=job.entity_count,
        error_message=job.error_message,
        started_at=job.started_at.isoformat() if job.started_at else "",
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
    )


@router.post("/url", response_model=ScrapeResponse)
async def scrape_single_url(
    payload: ScrapeRequest,
    session: AsyncSession = Depends(get_session),
):
    try:
        validate_url_for_fetch(payload.url, allow_onion=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    job = ScrapeJobORM(target_url=payload.url, status="running")
    session.add(job)
    await session.flush()

    try:
        page = await scrape_url(payload.url)
        nlp = await classify_and_embed(page.title, page.text[:3000])

        entity = EntityORM(
            type=nlp.entity_type,
            title=page.title,
            summary=page.summary,
            source_url=payload.url,
            source_label=payload.source_label,
            raw_content=page.text[:8000],
            embedding=nlp.embedding,
            confidence=nlp.confidence,
            trend_score=0.0,
            classified_at=datetime.utcnow(),
        )
        session.add(entity)

        job.status = "completed"
        job.entity_count = 1
        job.completed_at = datetime.utcnow()
        await session.commit()

        return ScrapeResponse(
            job_id=job.id,
            status="completed",
            entity_id=entity.id,
            entity_type=nlp.entity_type,
            title=page.title,
            confidence=nlp.confidence,
            message="Scraped, classified, and stored successfully.",
        )

    except Exception as exc:
        logger.error("Scrape failed for %s: %s", payload.url, exc)
        job.status = "failed"
        job.error_message = str(exc)[:500]
        job.completed_at = datetime.utcnow()
        await session.commit()
        raise HTTPException(status_code=422, detail=f"Scrape failed: {exc}")


@router.post("/onion", response_model=ScrapeResponse)
async def scrape_onion_url(
    payload: ScrapeRequest,
    session: AsyncSession = Depends(get_session),
):
    if not payload.url.endswith(".onion") and ".onion/" not in payload.url:
        raise HTTPException(status_code=400, detail="URL must be a .onion address")

    try:
        validate_url_for_fetch(payload.url, allow_onion=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    job = ScrapeJobORM(target_url=payload.url, status="running")
    session.add(job)
    await session.flush()

    try:
        page = await scrape_url(payload.url, via_tor=True)
        nlp = await classify_and_embed(page.title, page.text[:3000])

        entity = EntityORM(
            type=nlp.entity_type,
            title=page.title,
            summary=page.summary,
            source_url=payload.url,
            source_label=payload.source_label or "Tor / .onion",
            raw_content=page.text[:8000],
            embedding=nlp.embedding,
            confidence=nlp.confidence,
            trend_score=0.0,
            classified_at=datetime.utcnow(),
        )
        session.add(entity)

        job.status = "completed"
        job.entity_count = 1
        job.completed_at = datetime.utcnow()
        await session.commit()

        return ScrapeResponse(
            job_id=job.id,
            status="completed",
            entity_id=entity.id,
            entity_type=nlp.entity_type,
            title=page.title,
            confidence=nlp.confidence,
            message="Onion URL scraped via Tor and stored.",
        )

    except Exception as exc:
        logger.error("Onion scrape failed for %s: %s", payload.url, exc)
        job.status = "failed"
        job.error_message = str(exc)[:500]
        job.completed_at = datetime.utcnow()
        await session.commit()
        raise HTTPException(
            status_code=422,
            detail=f"Onion scrape failed: {exc} (is Tor running?)",
        )


@router.get("/jobs", response_model=PaginatedJobs)
async def list_jobs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    count_result = await session.execute(select(func.count()).select_from(ScrapeJobORM))
    total = count_result.scalar_one()

    stmt = (
        select(ScrapeJobORM)
        .order_by(ScrapeJobORM.started_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(stmt)
    jobs = result.scalars().all()

    return PaginatedJobs(
        total=total,
        limit=limit,
        offset=offset,
        items=[_job_out(j) for j in jobs],
    )


@router.get("/jobs/{job_id}", response_model=JobDetailOut)
async def get_job(job_id: str, session: AsyncSession = Depends(get_session)):
    stmt = select(ScrapeJobORM).where(ScrapeJobORM.id == job_id)
    result = await session.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    entity_stmt = (
        select(EntityORM)
        .where(EntityORM.source_url == job.target_url)
        .order_by(EntityORM.scraped_at.desc())
        .limit(10)
    )
    ent_result = await session.execute(entity_stmt)
    entity_rows = ent_result.scalars().all()
    entities = [
        {
            "id": e.id,
            "type": e.type,
            "title": e.title,
            "confidence": e.confidence,
        }
        for e in entity_rows
    ]

    return JobDetailOut(**_job_out(job).model_dump(), entities=entities)


@router.post("/trending", response_model=TrendingResponse)
async def trigger_trending(session: AsyncSession = Depends(get_session)):
    result = await run_trending_scrape(session)
    return TrendingResponse(
        **result,
        message=f"Trending scrape complete: {result['scraped']} new entities extracted.",
    )
