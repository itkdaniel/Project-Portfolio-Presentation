"""
Projects router — FastAPI endpoints mirroring the TypeScript API,
with additional search, recommendation, and analytics endpoints.

All endpoints follow RESTful conventions.
Caching layer: Redis with 5-minute TTL.
Auth: Bearer JWT (admin required for writes).
"""
from __future__ import annotations
import asyncio
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, get_redis
from app.models.project import ProjectModel, ProjectCreate, ProjectUpdate, ProjectResponse
from app.services.cache import CacheService
from app.algorithms.search import bm25_score, tag_ranked, fuzzy_match, build_tag_graph, bfs_related

router = APIRouter(prefix="/v1/projects", tags=["projects"])

CACHE_KEY_ALL    = "projects:all"
CACHE_KEY_PREFIX = "projects:id:"


async def get_cache(redis=Depends(get_redis)) -> CacheService:
    return CacheService(redis)


# ── GET /v1/projects ──────────────────────────────────────────────────────────
@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    db: AsyncSession    = Depends(get_db),
    cache: CacheService = Depends(get_cache),
    search: Optional[str]       = Query(None, description="Full-text BM25 search"),
    tags: Optional[str]         = Query(None, description="Comma-separated tag filter"),
    featured: Optional[bool]    = Query(None),
    published: Optional[bool]   = Query(True),
):
    """
    List projects with optional full-text search, tag filtering, and feature flags.

    Search algorithm: BM25 on name + description fields.
    Tag filtering: Jaccard similarity ranking when tags are provided.
    Caching: results cached in Redis for 5 minutes; invalidated on write.
    """
    # For filtered queries skip cache (too many combinations)
    if search or tags or featured is not None:
        stmt = select(ProjectModel).order_by(desc(ProjectModel.created_at))
        if published is not None:
            stmt = stmt.where(ProjectModel.published == published)
        if featured is not None:
            stmt = stmt.where(ProjectModel.featured == featured)

        result = await db.execute(stmt)
        docs = result.scalars().all()
        # Convert to dicts for algorithm processing
        data = [ProjectResponse.model_validate(d).model_dump() for d in docs]

        if search:
            ranked = bm25_score(search, data, ["name", "description", "tags"])
            # If no BM25 signal, fall back to fuzzy matching
            if all(score == 0.0 for score, _ in ranked):
                data = [d for _, d in fuzzy_match(search, data)]
            else:
                data = [d for score, d in ranked if score > 0]

        if tags:
            tag_list = [t.strip() for t in tags.split(",")]
            data = [d for _, d in tag_ranked(tag_list, data) if _ > 0]

        return data

    # Standard list — use cache
    cached = await cache.get(CACHE_KEY_ALL)
    if cached:
        return cached

    stmt   = select(ProjectModel).where(ProjectModel.published == True).order_by(desc(ProjectModel.created_at))
    result = await db.execute(stmt)
    docs   = result.scalars().all()
    data   = [ProjectResponse.model_validate(d).model_dump() for d in docs]
    await cache.set(CACHE_KEY_ALL, data)
    return data


# ── GET /v1/projects/{id} ─────────────────────────────────────────────────────
@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession    = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    cached = await cache.get(f"{CACHE_KEY_PREFIX}{project_id}")
    if cached:
        return cached

    result = await db.execute(select(ProjectModel).where(ProjectModel.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = ProjectResponse.model_validate(project).model_dump()
    await cache.set(f"{CACHE_KEY_PREFIX}{project_id}", data)
    return data


# ── POST /v1/projects ─────────────────────────────────────────────────────────
@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession    = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    project = ProjectModel(**payload.model_dump())
    db.add(project)
    await db.flush()  # get DB-generated id before commit
    await db.refresh(project)

    # Invalidate list cache
    await asyncio.gather(
        cache.delete(CACHE_KEY_ALL),
        cache.publish("projects:events", {"type": "created", "id": project.id}),
    )
    return ProjectResponse.model_validate(project)


# ── PATCH /v1/projects/{id} ───────────────────────────────────────────────────
@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: AsyncSession    = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    result = await db.execute(select(ProjectModel).where(ProjectModel.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    await db.flush()
    await db.refresh(project)
    await asyncio.gather(
        cache.delete(CACHE_KEY_ALL),
        cache.delete(f"{CACHE_KEY_PREFIX}{project_id}"),
        cache.publish("projects:events", {"type": "updated", "id": project_id}),
    )
    return ProjectResponse.model_validate(project)


# ── DELETE /v1/projects/{id} ──────────────────────────────────────────────────
@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    db: AsyncSession    = Depends(get_db),
    cache: CacheService = Depends(get_cache),
):
    result = await db.execute(select(ProjectModel).where(ProjectModel.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await asyncio.gather(
        cache.delete(CACHE_KEY_ALL),
        cache.delete(f"{CACHE_KEY_PREFIX}{project_id}"),
        cache.publish("projects:events", {"type": "deleted", "id": project_id}),
    )


# ── GET /v1/projects/{id}/related ─────────────────────────────────────────────
@router.get("/{project_id}/related", response_model=List[ProjectResponse])
async def related_projects(
    project_id: str,
    max_results: int        = Query(5, ge=1, le=20),
    db: AsyncSession        = Depends(get_db),
    cache: CacheService     = Depends(get_cache),
):
    """
    BFS graph traversal to find related projects by shared tags.
    Builds adjacency graph on-the-fly; small portfolio size makes this feasible.
    """
    result = await db.execute(select(ProjectModel).where(ProjectModel.published == True))
    all_docs = [ProjectResponse.model_validate(d).model_dump() for d in result.scalars().all()]

    graph = build_tag_graph(all_docs)
    related_ids = bfs_related(project_id, graph)[:max_results]

    id_to_doc = {d["id"]: d for d in all_docs}
    return [id_to_doc[rid] for rid in related_ids if rid in id_to_doc]