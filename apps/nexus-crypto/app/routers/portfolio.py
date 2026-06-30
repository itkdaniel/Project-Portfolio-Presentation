from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db_dep
from app.models import PortfolioModel, PortfolioAssetModel, PortfolioRead, PortfolioAssetCreate, PortfolioAssetUpdate, PortfolioAssetRead
from app.auth import require_auth
from app.routers.coins import STATIC_PRICES

router = APIRouter()

def enrich_asset(asset: PortfolioAssetModel) -> dict[str, Any]:
    price = STATIC_PRICES.get(asset.coin_symbol, 0.0)
    value = price * asset.quantity
    cost = asset.avg_cost_basis * asset.quantity
    pnl = value - cost
    pnl_pct = (pnl / cost * 100) if cost > 0 else 0.0
    
    return {
        "id": asset.id,
        "portfolio_id": asset.portfolio_id,
        "coin_symbol": asset.coin_symbol,
        "quantity": asset.quantity,
        "avg_cost_basis": asset.avg_cost_basis,
        "chain": asset.chain,
        "wallet_address": asset.wallet_address,
        "added_at": asset.added_at,
        "current_price": price,
        "current_value": value,
        "pnl": pnl,
        "pnl_pct": pnl_pct
    }

@router.get("", response_model=PortfolioRead)
async def get_portfolio(
    current_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db_dep)
):
    stmt = select(PortfolioModel).where(
        PortfolioModel.user_id == current_user["user_id"],
        PortfolioModel.is_default == True
    ).options(selectinload(PortfolioModel.assets))
    
    result = await db.execute(stmt)
    portfolio = result.scalar_one_or_none()
    
    if not portfolio:
        # Create default portfolio if not exists
        portfolio = PortfolioModel(
            user_id=current_user["user_id"],
            name="Main Portfolio",
            is_default=True
        )
        db.add(portfolio)
        await db.commit()
        await db.refresh(portfolio)
        portfolio.assets = []

    enriched_assets = [enrich_asset(a) for a in portfolio.assets]
    total_value = sum(a["current_value"] for a in enriched_assets)
    total_pnl = sum(a["pnl"] for a in enriched_assets)
    
    return {
        "id": portfolio.id,
        "user_id": portfolio.user_id,
        "name": portfolio.name,
        "description": portfolio.description,
        "is_default": portfolio.is_default,
        "created_at": portfolio.created_at,
        "assets": enriched_assets,
        "total_value_usd": total_value,
        "total_pnl_usd": total_pnl
    }

@router.post("/assets", response_model=PortfolioAssetRead)
async def add_asset(
    asset_in: PortfolioAssetCreate,
    current_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db_dep)
):
    # Find default portfolio
    stmt = select(PortfolioModel).where(
        PortfolioModel.user_id == current_user["user_id"],
        PortfolioModel.is_default == True
    )
    result = await db.execute(stmt)
    portfolio = result.scalar_one_or_none()
    
    if not portfolio:
        portfolio = PortfolioModel(user_id=current_user["user_id"], is_default=True)
        db.add(portfolio)
        await db.flush()

    asset = PortfolioAssetModel(
        portfolio_id=portfolio.id,
        **asset_in.dict()
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    
    return enrich_asset(asset)

@router.patch("/assets/{asset_id}", response_model=PortfolioAssetRead)
async def update_asset(
    asset_id: int,
    asset_in: PortfolioAssetUpdate,
    current_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db_dep)
):
    stmt = select(PortfolioAssetModel).join(PortfolioModel).where(
        PortfolioAssetModel.id == asset_id,
        PortfolioModel.user_id == current_user["user_id"]
    )
    result = await db.execute(stmt)
    asset = result.scalar_one_or_none()
    
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    if asset_in.quantity is not None:
        asset.quantity = asset_in.quantity
    if asset_in.avg_cost_basis is not None:
        asset.avg_cost_basis = asset_in.avg_cost_basis
        
    await db.commit()
    await db.refresh(asset)
    return enrich_asset(asset)

@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: int,
    current_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db_dep)
):
    stmt = select(PortfolioAssetModel).join(PortfolioModel).where(
        PortfolioAssetModel.id == asset_id,
        PortfolioModel.user_id == current_user["user_id"]
    )
    result = await db.execute(stmt)
    asset = result.scalar_one_or_none()
    
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    await db.delete(asset)
    await db.commit()
    return {"status": "deleted", "id": asset_id}
