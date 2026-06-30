"""
Portfolio performance metrics endpoints.

GET /v1/analytics/portfolio/performance — aggregated risk/return metrics
GET /v1/analytics/portfolio/breakdown   — latest per-asset P&L breakdown
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_dep
from app.engine import (
    calc_max_drawdown,
    calc_portfolio_return,
    calc_returns,
    calc_sharpe,
    calc_volatility,
)
from app.models import (
    AssetBreakdownItem,
    AssetSnapshotModel,
    BreakdownResponse,
    PerformanceResponse,
    PortfolioSnapshotModel,
)

router = APIRouter(prefix="/v1/analytics/portfolio", tags=["portfolio-performance"])


@router.get("/performance", response_model=PerformanceResponse)
async def get_performance(
    user_id: str = Query(..., description="User ID"),
    portfolio_id: str = Query("main", description="Portfolio ID"),
    db: AsyncSession = Depends(get_db_dep),
) -> PerformanceResponse:
    """
    Compute Sharpe ratio, max drawdown, 30-day volatility, and total return
    from all recorded snapshots for a user's portfolio.
    """
    result = await db.execute(
        select(PortfolioSnapshotModel)
        .where(
            PortfolioSnapshotModel.user_id == user_id,
            PortfolioSnapshotModel.portfolio_id == portfolio_id,
        )
        .order_by(PortfolioSnapshotModel.snapshot_at.asc())
    )
    rows = result.scalars().all()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No snapshots found for user_id={user_id!r} portfolio_id={portfolio_id!r}",
        )

    values = [r.total_value_usd for r in rows]
    cost_series = [r.total_cost_basis for r in rows]
    returns = calc_returns(values)
    last_30 = returns[-30:] if len(returns) >= 30 else returns

    latest = rows[-1]
    return PerformanceResponse(
        user_id=user_id,
        portfolio_id=portfolio_id,
        sharpe_ratio=round(calc_sharpe(returns), 4),
        max_drawdown_pct=round(calc_max_drawdown(values), 4),
        volatility_30d_pct=round(calc_volatility(last_30), 4),
        total_return_pct=round(
            calc_portfolio_return(cost_series[0] if cost_series else 0, values[-1]), 4
        ),
        latest_value_usd=round(latest.total_value_usd, 2),
        cost_basis_usd=round(latest.total_cost_basis, 2),
        snapshot_count=len(rows),
    )


@router.get("/breakdown", response_model=BreakdownResponse)
async def get_breakdown(
    user_id: str = Query(..., description="User ID"),
    portfolio_id: str = Query("main", description="Portfolio ID"),
    db: AsyncSession = Depends(get_db_dep),
) -> BreakdownResponse:
    """
    Return per-asset P&L breakdown from the most recent snapshot.
    """
    result = await db.execute(
        select(PortfolioSnapshotModel)
        .where(
            PortfolioSnapshotModel.user_id == user_id,
            PortfolioSnapshotModel.portfolio_id == portfolio_id,
        )
        .order_by(PortfolioSnapshotModel.snapshot_at.desc())
        .limit(1)
    )
    latest_snap = result.scalars().first()

    if latest_snap is None:
        raise HTTPException(
            status_code=404,
            detail=f"No snapshots found for user_id={user_id!r} portfolio_id={portfolio_id!r}",
        )

    asset_result = await db.execute(
        select(AssetSnapshotModel)
        .where(AssetSnapshotModel.snapshot_id == latest_snap.id)
        .order_by(AssetSnapshotModel.value_usd.desc())
    )
    assets = asset_result.scalars().all()

    return BreakdownResponse(
        user_id=user_id,
        portfolio_id=portfolio_id,
        assets=[
            AssetBreakdownItem(
                coin_symbol=a.coin_symbol,
                quantity=a.quantity,
                price_usd=a.price_usd,
                value_usd=a.value_usd,
                cost_basis=a.cost_basis,
                pnl=a.pnl,
                pnl_pct=a.pnl_pct,
                weight_pct=a.weight_pct,
            )
            for a in assets
        ],
        total_value_usd=latest_snap.total_value_usd,
        total_pnl=latest_snap.unrealized_pnl,
    )
