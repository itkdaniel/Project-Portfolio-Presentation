"""
Portfolio snapshot endpoints — record and retrieve portfolio valuations over time.

POST /v1/analytics/portfolio/snapshot  — record a new snapshot
GET  /v1/analytics/portfolio/snapshots — list historical snapshots
GET  /v1/analytics/portfolio/timeseries — timeseries data for charting
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_dep
from app.engine import calc_returns, calc_sharpe, calc_max_drawdown, calc_volatility
from app.models import (
    AssetInput,
    AssetSnapshotModel,
    AssetSnapshotRead,
    PortfolioSnapshotModel,
    PortfolioSnapshotRead,
    SnapshotCreate,
    TimeseriesResponse,
)

router = APIRouter(prefix="/v1/analytics/portfolio", tags=["portfolio-snapshots"])


def _compute_snapshot(assets: list[AssetInput], realized_pnl: float) -> dict:
    """Compute portfolio-level aggregates from a list of asset inputs."""
    total_value = sum(a.quantity * a.price_usd for a in assets)
    total_cost = sum(a.quantity * a.cost_basis for a in assets)
    unrealized_pnl = total_value - total_cost
    unrealized_pnl_pct = (unrealized_pnl / total_cost * 100.0) if total_cost > 0 else 0.0
    return {
        "total_value_usd": total_value,
        "total_cost_basis": total_cost,
        "unrealized_pnl": unrealized_pnl,
        "unrealized_pnl_pct": unrealized_pnl_pct,
        "realized_pnl": realized_pnl,
    }


@router.post("/snapshot", response_model=PortfolioSnapshotRead, status_code=201)
async def record_snapshot(
    body: SnapshotCreate,
    db: AsyncSession = Depends(get_db_dep),
) -> PortfolioSnapshotRead:
    """Record a portfolio snapshot with per-asset breakdown."""
    agg = _compute_snapshot(body.assets, body.realized_pnl)

    snapshot = PortfolioSnapshotModel(
        user_id=body.user_id,
        portfolio_id=body.portfolio_id,
        **agg,
    )
    db.add(snapshot)
    await db.flush()

    total_value = agg["total_value_usd"]
    asset_rows: list[AssetSnapshotModel] = []
    for a in body.assets:
        value = a.quantity * a.price_usd
        cost = a.quantity * a.cost_basis
        pnl = value - cost
        pnl_pct = (pnl / cost * 100.0) if cost > 0 else 0.0
        weight_pct = (value / total_value * 100.0) if total_value > 0 else 0.0
        row = AssetSnapshotModel(
            snapshot_id=snapshot.id,
            coin_symbol=a.coin_symbol,
            quantity=a.quantity,
            price_usd=a.price_usd,
            value_usd=value,
            cost_basis=cost,
            pnl=pnl,
            pnl_pct=pnl_pct,
            weight_pct=weight_pct,
        )
        db.add(row)
        asset_rows.append(row)

    await db.flush()

    asset_reads = [AssetSnapshotRead.model_validate(r) for r in asset_rows]
    snap_read = PortfolioSnapshotRead.model_validate(snapshot)
    snap_read.assets = asset_reads
    return snap_read


@router.get("/snapshots", response_model=list[PortfolioSnapshotRead])
async def list_snapshots(
    user_id: str = Query(..., description="User ID"),
    portfolio_id: str = Query("main", description="Portfolio ID"),
    limit: int = Query(90, ge=1, le=365),
    db: AsyncSession = Depends(get_db_dep),
) -> list[PortfolioSnapshotRead]:
    """List portfolio snapshots (most recent first)."""
    result = await db.execute(
        select(PortfolioSnapshotModel)
        .where(
            PortfolioSnapshotModel.user_id == user_id,
            PortfolioSnapshotModel.portfolio_id == portfolio_id,
        )
        .order_by(PortfolioSnapshotModel.snapshot_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()

    out = []
    for snap in rows:
        asset_result = await db.execute(
            select(AssetSnapshotModel).where(AssetSnapshotModel.snapshot_id == snap.id)
        )
        assets = asset_result.scalars().all()
        snap_read = PortfolioSnapshotRead.model_validate(snap)
        snap_read.assets = [AssetSnapshotRead.model_validate(a) for a in assets]
        out.append(snap_read)
    return out


@router.get("/timeseries", response_model=TimeseriesResponse)
async def get_timeseries(
    user_id: str = Query(..., description="User ID"),
    portfolio_id: str = Query("main", description="Portfolio ID"),
    limit: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db_dep),
) -> TimeseriesResponse:
    """Return portfolio value timeseries ordered chronologically for charting."""
    result = await db.execute(
        select(PortfolioSnapshotModel)
        .where(
            PortfolioSnapshotModel.user_id == user_id,
            PortfolioSnapshotModel.portfolio_id == portfolio_id,
        )
        .order_by(PortfolioSnapshotModel.snapshot_at.asc())
        .limit(limit)
    )
    rows = result.scalars().all()

    if not rows:
        return TimeseriesResponse(
            user_id=user_id,
            portfolio_id=portfolio_id,
            dates=[],
            values=[],
            cost_basis=[],
            pnl=[],
            pnl_pct=[],
        )

    dates = [r.snapshot_at.strftime("%Y-%m-%d") for r in rows]
    values = [r.total_value_usd for r in rows]
    cost_basis = [r.total_cost_basis for r in rows]
    pnl = [r.unrealized_pnl for r in rows]
    pnl_pct = [r.unrealized_pnl_pct for r in rows]

    return TimeseriesResponse(
        user_id=user_id,
        portfolio_id=portfolio_id,
        dates=dates,
        values=values,
        cost_basis=cost_basis,
        pnl=pnl,
        pnl_pct=pnl_pct,
    )
