"""
Entity API routes.

GET /v1/entities          — paginated list, filter by type / source_label
GET /v1/entities/:id      — single entity with outgoing relations
GET /v1/entity-types      — list available classification types
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.models.entity import EntityORM, EntityRelationORM, EntityTypeORM

router = APIRouter(prefix="/v1", tags=["entities"])


class EntityTypeOut(BaseModel):
    id: int
    name: str
    color: str
    description: str

    class Config:
        from_attributes = True


class RelationOut(BaseModel):
    id: int
    to_entity_id: str
    relation_type: str
    weight: float

    class Config:
        from_attributes = True


class EntityOut(BaseModel):
    id: str
    type: str
    title: str
    summary: Optional[str]
    source_url: str
    source_label: Optional[str]
    confidence: Optional[float]
    trend_score: float
    scraped_at: str
    classified_at: Optional[str]

    class Config:
        from_attributes = True


class EntityDetailOut(EntityOut):
    relations: list[RelationOut] = []


class PaginatedEntities(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[EntityOut]


@router.get("/entity-types", response_model=list[EntityTypeOut])
async def list_entity_types(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(EntityTypeORM).order_by(EntityTypeORM.name))
    return result.scalars().all()


@router.get("/entities", response_model=PaginatedEntities)
async def list_entities(
    type: Optional[str] = Query(None, description="Filter by entity type name"),
    source: Optional[str] = Query(None, description="Filter by source_label"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(EntityORM)
    count_stmt = select(func.count()).select_from(EntityORM)

    if type:
        stmt = stmt.where(EntityORM.type == type)
        count_stmt = count_stmt.where(EntityORM.type == type)
    if source:
        stmt = stmt.where(EntityORM.source_label == source)
        count_stmt = count_stmt.where(EntityORM.source_label == source)

    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    stmt = stmt.order_by(EntityORM.scraped_at.desc()).offset(offset).limit(limit)
    result = await session.execute(stmt)
    items = result.scalars().all()

    def _fmt(e: EntityORM) -> dict:
        return {
            "id": e.id,
            "type": e.type,
            "title": e.title,
            "summary": e.summary,
            "source_url": e.source_url,
            "source_label": e.source_label,
            "confidence": e.confidence,
            "trend_score": e.trend_score,
            "scraped_at": e.scraped_at.isoformat() if e.scraped_at else None,
            "classified_at": e.classified_at.isoformat() if e.classified_at else None,
        }

    return PaginatedEntities(
        total=total,
        limit=limit,
        offset=offset,
        items=[_fmt(e) for e in items],  # type: ignore[arg-type]
    )


@router.get("/entities/{entity_id}", response_model=EntityDetailOut)
async def get_entity(entity_id: str, session: AsyncSession = Depends(get_session)):
    stmt = (
        select(EntityORM)
        .options(selectinload(EntityORM.relations_from))
        .where(EntityORM.id == entity_id)
    )
    result = await session.execute(stmt)
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    relations = [
        RelationOut(
            id=r.id,
            to_entity_id=r.to_entity_id,
            relation_type=r.relation_type,
            weight=r.weight,
        )
        for r in entity.relations_from
    ]

    return EntityDetailOut(
        id=entity.id,
        type=entity.type,
        title=entity.title,
        summary=entity.summary,
        source_url=entity.source_url,
        source_label=entity.source_label,
        confidence=entity.confidence,
        trend_score=entity.trend_score,
        scraped_at=entity.scraped_at.isoformat() if entity.scraped_at else "",
        classified_at=entity.classified_at.isoformat() if entity.classified_at else None,
        relations=relations,
    )
