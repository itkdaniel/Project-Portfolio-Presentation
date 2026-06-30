from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db_dep
from app.models import PoolModel, PoolRead, PoolCreate, QuoteResponse
from app.amm import get_amount_out, get_price_impact

router = APIRouter(prefix="/v1/dex/pools", tags=["pools"])

@router.get("", response_model=List[PoolRead])
async def list_pools(db: AsyncSession = Depends(get_db_dep)):
    result = await db.execute(select(PoolModel))
    return result.scalars().all()

@router.get("/{pool_id}", response_model=PoolRead)
async def get_pool(pool_id: int, db: AsyncSession = Depends(get_db_dep)):
    pool = await db.get(PoolModel, pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    return pool

@router.post("", response_model=PoolRead)
async def create_pool(pool_in: PoolCreate, db: AsyncSession = Depends(get_db_dep)):
    pool = PoolModel(
        name=pool_in.name,
        token_a=pool_in.token_a,
        token_b=pool_in.token_b,
        reserve_a=pool_in.initial_reserve_a,
        reserve_b=pool_in.initial_reserve_b,
        fee_bps=pool_in.fee_bps,
        total_lp_tokens=pool_in.initial_reserve_a * 1000, # Simplified
        price=pool_in.initial_reserve_b / pool_in.initial_reserve_a if pool_in.initial_reserve_a > 0 else 0,
        tvl_usd=pool_in.initial_reserve_b * 2
    )
    db.add(pool)
    await db.commit()
    await db.refresh(pool)
    return pool

@router.get("/{pool_id}/quote", response_model=QuoteResponse)
async def get_quote(
    pool_id: int,
    token_in: str,
    amount_in: float,
    db: AsyncSession = Depends(get_db_dep)
):
    pool = await db.get(PoolModel, pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    
    if token_in == pool.token_a:
        reserve_in, reserve_out = pool.reserve_a, pool.reserve_b
    elif token_in == pool.token_b:
        reserve_in, reserve_out = pool.reserve_b, pool.reserve_a
    else:
        raise HTTPException(status_code=400, detail="Invalid token for this pool")
    
    amount_out = get_amount_out(amount_in, reserve_in, reserve_out, pool.fee_bps)
    price_impact = get_price_impact(amount_in, reserve_in)
    fee = amount_in * pool.fee_bps / 10000
    effective_price = amount_out / amount_in if amount_in > 0 else 0
    
    return QuoteResponse(
        amount_out=amount_out,
        price_impact_pct=price_impact,
        fee=fee,
        effective_price=effective_price
    )
