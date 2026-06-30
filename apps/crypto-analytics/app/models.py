"""
SQLAlchemy ORM models and Pydantic schemas for crypto-analytics portfolio tracking.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ═══════════════════════════════════════════════════════════════════════════════
# ORM Models
# ═══════════════════════════════════════════════════════════════════════════════

class PortfolioSnapshotModel(Base):
    """One-per-day portfolio valuation snapshot for a given user + portfolio."""
    __tablename__ = "portfolio_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    portfolio_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    total_value_usd: Mapped[float] = mapped_column(Float, nullable=False)
    total_cost_basis: Mapped[float] = mapped_column(Float, nullable=False)
    unrealized_pnl: Mapped[float] = mapped_column(Float, nullable=False)
    unrealized_pnl_pct: Mapped[float] = mapped_column(Float, nullable=False)
    realized_pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sharpe_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_drawdown_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volatility_30d: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AssetSnapshotModel(Base):
    """Per-asset breakdown row linked to a PortfolioSnapshotModel."""
    __tablename__ = "asset_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("portfolio_snapshots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    coin_symbol: Mapped[str] = mapped_column(String, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    value_usd: Mapped[float] = mapped_column(Float, nullable=False)
    cost_basis: Mapped[float] = mapped_column(Float, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, nullable=False)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=False)
    weight_pct: Mapped[float] = mapped_column(Float, nullable=False)


# ═══════════════════════════════════════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════════════════════════════════════

class AssetInput(BaseModel):
    """One asset line when recording a snapshot."""
    coin_symbol: str
    quantity: float = Field(gt=0)
    price_usd: float = Field(gt=0)
    cost_basis: float = Field(ge=0)


class SnapshotCreate(BaseModel):
    user_id: str
    portfolio_id: str = "main"
    assets: list[AssetInput] = Field(min_length=1)
    realized_pnl: float = 0.0


class AssetSnapshotRead(BaseModel):
    id: int
    snapshot_id: int
    coin_symbol: str
    quantity: float
    price_usd: float
    value_usd: float
    cost_basis: float
    pnl: float
    pnl_pct: float
    weight_pct: float

    model_config = {"from_attributes": True}


class PortfolioSnapshotRead(BaseModel):
    id: int
    user_id: str
    portfolio_id: str
    total_value_usd: float
    total_cost_basis: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    realized_pnl: float
    sharpe_ratio: Optional[float]
    max_drawdown_pct: Optional[float]
    volatility_30d: Optional[float]
    snapshot_at: datetime
    assets: list[AssetSnapshotRead] = []

    model_config = {"from_attributes": True}


class TimeseriesResponse(BaseModel):
    user_id: str
    portfolio_id: str
    dates: list[str]
    values: list[float]
    cost_basis: list[float]
    pnl: list[float]
    pnl_pct: list[float]


class PerformanceResponse(BaseModel):
    user_id: str
    portfolio_id: str
    sharpe_ratio: float
    max_drawdown_pct: float
    volatility_30d_pct: float
    total_return_pct: float
    latest_value_usd: float
    cost_basis_usd: float
    snapshot_count: int


class AssetBreakdownItem(BaseModel):
    coin_symbol: str
    quantity: float
    price_usd: float
    value_usd: float
    cost_basis: float
    pnl: float
    pnl_pct: float
    weight_pct: float


class BreakdownResponse(BaseModel):
    user_id: str
    portfolio_id: str
    assets: list[AssetBreakdownItem]
    total_value_usd: float
    total_pnl: float
