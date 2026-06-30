from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.database import get_db_dep
from app.models import (
    PoolModel, 
    LiquidityPositionModel, 
    LiquidityPositionRead, 
    LiquidityAdd, 
    LiquidityRemove
)
from app.amm import get_lp_tokens_to_mint

router = APIRouter(prefix="/v1/dex/liquidity", tags=["liquidity"])

@router.get("", response_model=List[LiquidityPositionRead])
async def list_liquidity(
    user_address: Optional[str] = None,
    db: AsyncSession = Depends(get_db_dep)
):
    query = select(LiquidityPositionModel)
    if user_address:
        query = query.where(LiquidityPositionModel.user_address == user_address)
    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/add", response_model=LiquidityPositionRead)
async def add_liquidity(
    liq_in: LiquidityAdd,
    db: AsyncSession = Depends(get_db_dep)
):
    pool = await db.get(PoolModel, liq_in.pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    
    lp_to_mint = get_lp_tokens_to_mint(
        liq_in.amount_a, 
        liq_in.amount_b, 
        pool.reserve_a, 
        pool.reserve_b, 
        pool.total_lp_tokens
    )
    
    # Update pool
    pool.reserve_a += liq_in.amount_a
    pool.reserve_b += liq_in.amount_b
    pool.total_lp_tokens += lp_to_mint
    pool.price = pool.reserve_b / pool.reserve_a if pool.reserve_a > 0 else 0
    pool.tvl_usd = pool.reserve_b * 2 # Simple approximation
    
    # Create or update position
    result = await db.execute(
        select(LiquidityPositionModel).where(
            LiquidityPositionModel.pool_id == liq_in.pool_id,
            LiquidityPositionModel.user_address == liq_in.user_address
        )
    )
    pos = result.scalars().first()
    
    if pos:
        pos.lp_tokens += lp_to_mint
        # Simple weighted entry reserve update
        pos.entry_reserve_a = (pos.entry_reserve_a + pool.reserve_a) / 2
        pos.entry_reserve_b = (pos.entry_reserve_b + pool.reserve_b) / 2
    else:
        pos = LiquidityPositionModel(
            pool_id=liq_in.pool_id,
            user_address=liq_in.user_address,
            lp_tokens=lp_to_mint,
            share_pct=(lp_to_mint / pool.total_lp_tokens) * 100,
            entry_reserve_a=pool.reserve_a,
            entry_reserve_b=pool.reserve_b
        )
        db.add(pos)
    
    await db.flush()
    pos.share_pct = (pos.lp_tokens / pool.total_lp_tokens) * 100
    
    await db.commit()
    await db.refresh(pos)
    return pos

@router.post("/remove", response_model=LiquidityPositionRead)
async def remove_liquidity(
    liq_in: LiquidityRemove,
    db: AsyncSession = Depends(get_db_dep)
):
    pos = await db.get(LiquidityPositionModel, liq_in.position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    
    if liq_in.lp_tokens > pos.lp_tokens:
        raise HTTPException(status_code=400, detail="Insufficient LP tokens")
    
    pool = await db.get(PoolModel, pos.pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    
    share = liq_in.lp_tokens / pool.total_lp_tokens
    amount_a = pool.reserve_a * share
    amount_b = pool.reserve_b * share
    
    pool.reserve_a -= amount_a
    pool.reserve_b -= amount_b
    pool.total_lp_tokens -= liq_in.lp_tokens
    pool.price = pool.reserve_b / pool.reserve_a if pool.reserve_a > 0 else 0
    
    pos.lp_tokens -= liq_in.lp_tokens
    if pool.total_lp_tokens > 0:
        pos.share_pct = (pos.lp_tokens / pool.total_lp_tokens) * 100
    else:
        pos.share_pct = 0
        
    if pos.lp_tokens <= 0:
        await db.delete(pos)
        await db.commit()
        # Return a dummy object since we deleted it
        return pos
    
    await db.commit()
    await db.refresh(pos)
    return pos
