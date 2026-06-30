from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime

from app.database import get_db_dep
from app.models import PoolModel, OrderModel, TradeModel, OrderRead, OrderCreate
from app.amm import get_amount_out, get_price_impact, make_tx_hash

router = APIRouter(prefix="/v1/dex/orders", tags=["orders"])

@router.get("", response_model=List[OrderRead])
async def list_orders(
    trader_address: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db_dep)
):
    query = select(OrderModel)
    if trader_address:
        query = query.where(OrderModel.trader_address == trader_address)
    if status:
        query = query.where(OrderModel.status == status)
    query = query.limit(limit).order_by(OrderModel.created_at.desc())
    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=OrderRead)
async def place_order(order_in: OrderCreate, db: AsyncSession = Depends(get_db_dep)):
    pool = await db.get(PoolModel, order_in.pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    
    order = OrderModel(
        pool_id=order_in.pool_id,
        trader_address=order_in.trader_address,
        order_type=order_in.order_type,
        side=order_in.side,
        token_in=order_in.token_in,
        token_out=order_in.token_out,
        amount_in=order_in.amount_in,
        amount_out_min=order_in.amount_out_min,
        slippage_bps=order_in.slippage_bps,
        status="pending"
    )
    db.add(order)
    await db.flush()

    if order_in.order_type == "market":
        # Execute immediately via AMM
        if order_in.token_in == pool.token_a:
            reserve_in, reserve_out = pool.reserve_a, pool.reserve_b
        elif order_in.token_in == pool.token_b:
            reserve_in, reserve_out = pool.reserve_b, pool.reserve_a
        else:
            raise HTTPException(status_code=400, detail="Invalid token for this pool")
        
        amount_out = get_amount_out(order_in.amount_in, reserve_in, reserve_out, pool.fee_bps)
        price_impact = get_price_impact(order_in.amount_in, reserve_in)
        
        if amount_out < order_in.amount_out_min:
            order.status = "failed"
            await db.commit()
            raise HTTPException(status_code=400, detail="Slippage too high")
        
        # Update reserves
        if order_in.token_in == pool.token_a:
            pool.reserve_a += order_in.amount_in
            pool.reserve_b -= amount_out
        else:
            pool.reserve_b += order_in.amount_in
            pool.reserve_a -= amount_out
        
        pool.price = pool.reserve_b / pool.reserve_a if pool.reserve_a > 0 else 0
        pool.volume_24h += order_in.amount_in if order_in.token_in == "USDC" else amount_out
        
        order.status = "filled"
        order.amount_out_actual = amount_out
        order.fill_price = amount_out / order_in.amount_in if order_in.amount_in > 0 else 0
        order.fee_paid = order_in.amount_in * pool.fee_bps / 10000
        order.filled_at = datetime.utcnow()
        
        trade = TradeModel(
            order_id=order.id,
            pool_id=pool.id,
            trader_address=order.trader_address,
            token_in=order.token_in,
            token_out=order.token_out,
            amount_in=order.amount_in,
            amount_out=amount_out,
            fee=order.fee_paid,
            price_impact_pct=price_impact,
            tx_hash=make_tx_hash()
        )
        db.add(trade)
    
    await db.commit()
    await db.refresh(order)
    return order

@router.get("/{order_id}", response_model=OrderRead)
async def get_order(order_id: int, db: AsyncSession = Depends(get_db_dep)):
    order = await db.get(OrderModel, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.post("/{order_id}/cancel", response_model=OrderRead)
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db_dep)):
    order = await db.get(OrderModel, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending orders can be cancelled")
    
    order.status = "cancelled"
    await db.commit()
    await db.refresh(order)
    return order
