"""
ORM models and Pydantic schemas for crypto-market.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ── ORM Models ──────────────────────────────────────────────────────────────

class ExchangeModel(Base):
    __tablename__ = "exchanges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    api_url: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CoinModel(Base):
    __tablename__ = "coins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    coingecko_id: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True)
    decimals: Mapped[int] = mapped_column(Integer, default=18)
    logo_url: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    prices: Mapped[list[PriceTickModel]] = relationship(back_populates="coin", cascade="all, delete-orphan")
    candles: Mapped[list[OHLCVCandleModel]] = relationship(back_populates="coin", cascade="all, delete-orphan")


class PriceTickModel(Base):
    __tablename__ = "price_ticks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    coin_id: Mapped[int] = mapped_column(Integer, ForeignKey("coins.id"), nullable=False)
    exchange_slug: Mapped[str] = mapped_column(String(64), default="aggregate")
    price_usd: Mapped[float] = mapped_column(Float, nullable=False)
    bid: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ask: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volume_24h: Mapped[float] = mapped_column(Float, default=0.0)
    price_change_24h: Mapped[float] = mapped_column(Float, default=0.0)
    price_change_7d: Mapped[float] = mapped_column(Float, default=0.0)
    market_cap: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    circulating_supply: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    coin: Mapped[CoinModel] = relationship(back_populates="prices")


class OHLCVCandleModel(Base):
    __tablename__ = "ohlcv_candles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    coin_id: Mapped[int] = mapped_column(Integer, ForeignKey("coins.id"), nullable=False)
    exchange_slug: Mapped[str] = mapped_column(String(64), default="aggregate")
    interval: Mapped[str] = mapped_column(String(10), nullable=False)  # "1m","5m","15m","1h","4h","1d","1w"
    open_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False)
    quote_volume: Mapped[float] = mapped_column(Float, default=0.0)
    trade_count: Mapped[int] = mapped_column(Integer, default=0)

    coin: Mapped[CoinModel] = relationship(back_populates="candles")


# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class CoinRead(BaseModel):
    id: int
    symbol: str
    name: str
    coingecko_id: Optional[str] = None
    decimals: int
    logo_url: Optional[str] = None
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


class PriceTickRead(BaseModel):
    id: int
    coin_id: int
    coin_symbol: str
    exchange_slug: str
    price_usd: float
    bid: Optional[float] = None
    ask: Optional[float] = None
    volume_24h: float
    price_change_24h: float
    price_change_7d: float
    market_cap: Optional[float] = None
    circulating_supply: Optional[float] = None
    recorded_at: datetime

    class Config:
        from_attributes = True


class OHLCVCandleRead(BaseModel):
    id: int
    coin_id: int
    coin_symbol: str
    exchange_slug: str
    interval: str
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    class Config:
        from_attributes = True


class ExchangeRead(BaseModel):
    id: int
    slug: str
    name: str
    api_url: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class PriceTickIngest(BaseModel):
    symbol: str
    price_usd: float
    exchange_slug: str = "aggregate"
    bid: Optional[float] = None
    ask: Optional[float] = None
    volume_24h: float = 0.0
    price_change_24h: float = 0.0
    price_change_7d: float = 0.0
    market_cap: Optional[float] = None
    circulating_supply: Optional[float] = None


class OHLCVCandleIngest(BaseModel):
    symbol: str
    exchange_slug: str = "aggregate"
    interval: str
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float = 0.0
    trade_count: int = 0
