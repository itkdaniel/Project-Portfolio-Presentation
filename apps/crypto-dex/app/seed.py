import random
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import PoolModel, TradeModel, LiquidityPositionModel, OrderModel
from app.amm import make_tx_hash

async def seed_db(session: AsyncSession) -> None:
    # Check if already seeded
    result = await session.execute(select(PoolModel).limit(1))
    if result.scalars().first():
        return

    pools_data = [
        {"name": "ETH/USDC", "token_a": "ETH", "token_b": "USDC", "reserve_a": 100.0, "reserve_b": 340000.0, "fee_bps": 30},
        {"name": "BTC/USDC", "token_a": "BTC", "token_b": "USDC", "reserve_a": 5.0, "reserve_b": 335000.0, "fee_bps": 30},
        {"name": "SOL/USDC", "token_a": "SOL", "token_b": "USDC", "reserve_a": 2000.0, "reserve_b": 330000.0, "fee_bps": 30},
        {"name": "ETH/BTC", "token_a": "ETH", "token_b": "BTC", "reserve_a": 50.0, "reserve_b": 2.5, "fee_bps": 30},
        {"name": "MATIC/USDC", "token_a": "MATIC", "token_b": "USDC", "reserve_a": 10000.0, "reserve_b": 8500.0, "fee_bps": 30},
    ]

    pools = []
    for p in pools_data:
        pool = PoolModel(
            name=p["name"],
            token_a=p["token_a"],
            token_b=p["token_b"],
            reserve_a=p["reserve_a"],
            reserve_b=p["reserve_b"],
            fee_bps=p["fee_bps"],
            total_lp_tokens=p["reserve_a"] * 1000, # Simplified LP tokens
            price=p["reserve_b"] / p["reserve_a"],
            tvl_usd=p["reserve_b"] * 2,
            volume_24h=random.uniform(10000, 50000),
            apr=random.uniform(5, 20)
        )
        session.add(pool)
        pools.append(pool)
    
    await session.flush()

    # Add liquidity positions for demo-user
    demo_user = "demo-user"
    for pool in pools[:3]: # ETH/USDC, BTC/USDC, SOL/USDC
        lp_tokens = pool.total_lp_tokens * 0.1
        pos = LiquidityPositionModel(
            pool_id=pool.id,
            user_address=demo_user,
            lp_tokens=lp_tokens,
            share_pct=10.0,
            entry_reserve_a=pool.reserve_a,
            entry_reserve_b=pool.reserve_b
        )
        session.add(pos)

    # Add historical trades
    for pool in pools:
        for i in range(10):
            side = random.choice(["buy", "sell"])
            amount_in = random.uniform(0.1, 1.0) if pool.token_a in ["BTC", "ETH"] else random.uniform(10, 100)
            
            # Simple trade representation
            price = pool.price * (1 + random.uniform(-0.02, 0.02))
            amount_out = amount_in * price if side == "sell" else amount_in / price
            
            order = OrderModel(
                pool_id=pool.id,
                trader_address=f"0x{random.randint(1000, 9999)}...{random.randint(1000, 9999)}",
                order_type="market",
                side=side,
                token_in=pool.token_a if side == "sell" else pool.token_b,
                token_out=pool.token_b if side == "sell" else pool.token_a,
                amount_in=amount_in,
                status="filled",
                fill_price=price,
                amount_out_actual=amount_out,
                fee_paid=amount_in * 0.003,
                filled_at=datetime.utcnow() - timedelta(hours=random.randint(1, 48))
            )
            session.add(order)
            await session.flush()

            trade = TradeModel(
                order_id=order.id,
                pool_id=pool.id,
                trader_address=order.trader_address,
                token_in=order.token_in,
                token_out=order.token_out,
                amount_in=order.amount_in,
                amount_out=order.amount_out_actual,
                fee=order.fee_paid,
                price_impact_pct=random.uniform(0.01, 0.5),
                tx_hash=make_tx_hash(),
                executed_at=order.filled_at
            )
            session.add(trade)

    await session.commit()
