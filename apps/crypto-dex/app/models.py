from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from sqlalchemy import Float, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, Field

from app.database import Base

# ── ORM Models ───────────────────────────────────────────────────────────────

class PoolModel(Base):
    __tablename__ = "pools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    token_a: Mapped[str] = mapped_column(String(10), nullable=False)
    token_b: Mapped[str] = mapped_column(String(10), nullable=False)
    reserve_a: Mapped[float] = mapped_column(Float, default=0.0)
    reserve_b: Mapped[float] = mapped_column(Float, default=0.0)
    fee_bps: Mapped[int] = mapped_column(Integer, default=30)
    total_lp_tokens: Mapped[float] = mapped_column(Float, default=0.0)
    price: Mapped[float] = mapped_column(Float, default=0.0)
    volume_24h: Mapped[float] = mapped_column(Float, default=0.0)
    tvl_usd: Mapped[float] = mapped_column(Float, default=0.0)
    apr: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    positions: Mapped[List["LiquidityPositionModel"]] = relationship(back_populates="pool")
    orders: Mapped[List["OrderModel"]] = relationship(back_populates="pool")
    trades: Mapped[List["TradeModel"]] = relationship(back_populates="pool")

class LiquidityPositionModel(Base):
    __tablename__ = "liquidity_positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pool_id: Mapped[int] = mapped_column(ForeignKey("pools.id"), nullable=False)
    user_address: Mapped[str] = mapped_column(String(64), nullable=False)
    lp_tokens: Mapped[float] = mapped_column(Float, nullable=False)
    share_pct: Mapped[float] = mapped_column(Float, nullable=False)
    entry_reserve_a: Mapped[float] = mapped_column(Float, nullable=False)
    entry_reserve_b: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    pool: Mapped["PoolModel"] = relationship(back_populates="positions")

class OrderModel(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pool_id: Mapped[int] = mapped_column(ForeignKey("pools.id"), nullable=False)
    trader_address: Mapped[str] = mapped_column(String(64), nullable=False)
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "market" or "limit"
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # "buy" or "sell"
    token_in: Mapped[str] = mapped_column(String(10), nullable=False)
    token_out: Mapped[str] = mapped_column(String(10), nullable=False)
    amount_in: Mapped[float] = mapped_column(Float, nullable=False)
    amount_out_min: Mapped[float] = mapped_column(Float, default=0.0)
    slippage_bps: Mapped[int] = mapped_column(Integer, default=50)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending","filled","cancelled","failed"
    fill_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    amount_out_actual: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fee_paid: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    filled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    pool: Mapped["PoolModel"] = relationship(back_populates="orders")
    trades: Mapped[List["TradeModel"]] = relationship(back_populates="order")

class TradeModel(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    pool_id: Mapped[int] = mapped_column(ForeignKey("pools.id"), nullable=False)
    trader_address: Mapped[str] = mapped_column(String(64), nullable=False)
    token_in: Mapped[str] = mapped_column(String(10), nullable=False)
    token_out: Mapped[str] = mapped_column(String(10), nullable=False)
    amount_in: Mapped[float] = mapped_column(Float, nullable=False)
    amount_out: Mapped[float] = mapped_column(Float, nullable=False)
    fee: Mapped[float] = mapped_column(Float, nullable=False)
    price_impact_pct: Mapped[float] = mapped_column(Float, nullable=False)
    tx_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    pool: Mapped["PoolModel"] = relationship(back_populates="trades")
    order: Mapped["OrderModel"] = relationship(back_populates="trades")

# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class PoolRead(BaseModel):
    id: int
    name: str
    token_a: str
    token_b: str
    reserve_a: float
    reserve_b: float
    fee_bps: int
    total_lp_tokens: float
    price: float
    volume_24h: float
    tvl_usd: float
    apr: float
    created_at: datetime

    class Config:
        from_attributes = True

class PoolCreate(BaseModel):
    name: str
    token_a: str
    token_b: str
    initial_reserve_a: float
    initial_reserve_b: float
    fee_bps: int = 30

class LiquidityPositionRead(BaseModel):
    id: int
    pool_id: int
    user_address: str
    lp_tokens: float
    share_pct: float
    entry_reserve_a: float
    entry_reserve_b: float
    created_at: datetime

    class Config:
        from_attributes = True

class OrderRead(BaseModel):
    id: int
    pool_id: int
    trader_address: str
    order_type: str
    side: str
    token_in: str
    token_out: str
    amount_in: float
    amount_out_min: float
    slippage_bps: int
    status: str
    fill_price: Optional[float]
    amount_out_actual: Optional[float]
    fee_paid: Optional[float]
    filled_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True

class TradeRead(BaseModel):
    id: int
    order_id: int
    pool_id: int
    trader_address: str
    token_in: str
    token_out: str
    amount_in: float
    amount_out: float
    fee: float
    price_impact_pct: float
    tx_hash: str
    executed_at: datetime

    class Config:
        from_attributes = True

class QuoteResponse(BaseModel):
    amount_out: float
    price_impact_pct: float
    fee: float
    effective_price: float

class OrderCreate(BaseModel):
    pool_id: int
    trader_address: str
    order_type: str = "market"
    side: str
    token_in: str
    token_out: str
    amount_in: float
    amount_out_min: float = 0.0
    slippage_bps: int = 50

class LiquidityAdd(BaseModel):
    pool_id: int
    user_address: str
    amount_a: float
    amount_b: float

class LiquidityRemove(BaseModel):
    position_id: int
    lp_tokens: float
