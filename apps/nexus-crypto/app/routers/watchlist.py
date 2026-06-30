from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.database import get_db_dep
from app.models import WatchlistModel, WatchlistRead, WatchlistCreate
from app.auth import require_auth
from app.routers.coins import STATIC_PRICES

router = APIRouter()

@router.get("", response_model=list[WatchlistRead])
async def get_watchlist(
    current_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db_dep)
):
    stmt = select(WatchlistModel).where(WatchlistModel.user_id == current_user["user_id"])
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    enriched = []
    for item in items:
        enriched.append({
            "id": item.id,
            "user_id": item.user_id,
            "coin_symbol": item.coin_symbol,
            "added_at": item.added_at,
            "current_price": STATIC_PRICES.get(item.coin_symbol)
        })
    return enriched

@router.post("", response_model=WatchlistRead)
async def add_to_watchlist(
    item_in: WatchlistCreate,
    current_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db_dep)
):
    # Check if already in watchlist
    stmt = select(WatchlistModel).where(
        WatchlistModel.user_id == current_user["user_id"],
        WatchlistModel.coin_symbol == item_in.coin_symbol
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Coin already in watchlist")
        
    item = WatchlistModel(
        user_id=current_user["user_id"],
        coin_symbol=item_in.coin_symbol
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    
    return {
        "id": item.id,
        "user_id": item.user_id,
        "coin_symbol": item.coin_symbol,
        "added_at": item.added_at,
        "current_price": STATIC_PRICES.get(item.coin_symbol)
    }

@router.delete("/{item_id}")
async def remove_from_watchlist(
    item_id: int,
    current_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db_dep)
):
    stmt = select(WatchlistModel).where(
        WatchlistModel.id == item_id,
        WatchlistModel.user_id == current_user["user_id"]
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
        
    await db.delete(item)
    await db.commit()
    return {"status": "removed", "id": item_id}
