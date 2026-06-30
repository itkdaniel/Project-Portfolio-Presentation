from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Float, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, EmailStr

from app.database import Base


# ── ORM Models ───────────────────────────────────────────────────────────────

class CryptoUserModel(Base):
    __tablename__ = "crypto_users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class PortfolioModel(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String, default="Main Portfolio")
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    assets: Mapped[list["PortfolioAssetModel"]] = relationship(back_populates="portfolio", cascade="all, delete-orphan")


class PortfolioAssetModel(Base):
    __tablename__ = "portfolio_assets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"), index=True)
    coin_symbol: Mapped[str] = mapped_column(String)
    quantity: Mapped[float] = mapped_column(Float)
    avg_cost_basis: Mapped[float] = mapped_column(Float)
    chain: Mapped[str] = mapped_column(String, default="EVM")
    wallet_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    portfolio: Mapped["PortfolioModel"] = relationship(back_populates="assets")


class WatchlistModel(Base):
    __tablename__ = "watchlists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    coin_symbol: Mapped[str] = mapped_column(String)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    user_id: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserRead

class PortfolioAssetBase(BaseModel):
    coin_symbol: str
    quantity: float
    avg_cost_basis: float
    chain: str = "EVM"
    wallet_address: Optional[str] = None

class PortfolioAssetCreate(PortfolioAssetBase):
    pass

class PortfolioAssetUpdate(BaseModel):
    quantity: Optional[float] = None
    avg_cost_basis: Optional[float] = None

class PortfolioAssetRead(PortfolioAssetBase):
    id: int
    portfolio_id: int
    added_at: datetime
    current_price: Optional[float] = None
    current_value: Optional[float] = None
    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None

    class Config:
        from_attributes = True

class PortfolioRead(BaseModel):
    id: int
    user_id: str
    name: str
    description: Optional[str] = None
    is_default: bool
    created_at: datetime
    assets: list[PortfolioAssetRead] = []
    total_value_usd: float = 0.0
    total_pnl_usd: float = 0.0

    class Config:
        from_attributes = True

class WatchlistRead(BaseModel):
    id: int
    user_id: str
    coin_symbol: str
    added_at: datetime
    current_price: Optional[float] = None

    class Config:
        from_attributes = True

class WatchlistCreate(BaseModel):
    coin_symbol: str
