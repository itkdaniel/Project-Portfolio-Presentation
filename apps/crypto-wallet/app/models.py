from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ── ORM Models ────────────────────────────────────────────────────────────────

class WalletModel(Base):
    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    chain: Mapped[str] = mapped_column(String(32), nullable=False)  # "EVM", "UTXO", "SOL"
    hd_path: Mapped[str] = mapped_column(String(128), nullable=False)
    master_pubkey: Mapped[str] = mapped_column(String(256), nullable=False)
    is_watch_only: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    addresses: Mapped[List["AddressModel"]] = relationship("AddressModel", back_populates="wallet", cascade="all, delete-orphan")
    transactions: Mapped[List["WalletTransactionModel"]] = relationship("WalletTransactionModel", back_populates="wallet", cascade="all, delete-orphan")


class AddressModel(Base):
    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    wallet_id: Mapped[int] = mapped_column(Integer, ForeignKey("wallets.id"), nullable=False, index=True)
    path_index: Mapped[int] = mapped_column(Integer, nullable=False)
    address: Mapped[str] = mapped_column(String(256), unique=True, nullable=False, index=True)
    chain: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_change: Mapped[bool] = mapped_column(Boolean, default=False)

    wallet: Mapped["WalletModel"] = relationship("WalletModel", back_populates="addresses")
    balances: Mapped[List["TokenBalanceModel"]] = relationship("TokenBalanceModel", back_populates="address", cascade="all, delete-orphan")


class TokenBalanceModel(Base):
    __tablename__ = "token_balances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    address_id: Mapped[int] = mapped_column(Integer, ForeignKey("addresses.id"), nullable=False, index=True)
    token_symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    contract_address: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)  # null = native coin
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    amount_raw: Mapped[str] = mapped_column(String(128), default="0")  # wei/lamports as string
    last_synced_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    address: Mapped["AddressModel"] = relationship("AddressModel", back_populates="balances")


class WalletTransactionModel(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    wallet_id: Mapped[int] = mapped_column(Integer, ForeignKey("wallets.id"), nullable=False, index=True)
    from_address: Mapped[str] = mapped_column(String(256), nullable=False)
    to_address: Mapped[str] = mapped_column(String(256), nullable=False)
    tx_hash: Mapped[str] = mapped_column(String(256), unique=True, nullable=False, index=True)
    chain: Mapped[str] = mapped_column(String(32), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # "in" or "out"
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    fee: Mapped[float] = mapped_column(Float, default=0.0)
    token_symbol: Mapped[str] = mapped_column(String(32), default="ETH")
    contract_address: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")  # "pending","confirmed","failed")
    block_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    wallet: Mapped["WalletModel"] = relationship("WalletModel", back_populates="transactions")


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class TokenBalanceRead(BaseModel):
    id: int
    address_id: int
    token_symbol: str
    contract_address: Optional[str]
    amount: float
    last_synced_at: datetime

    class Config:
        from_attributes = True


class AddressRead(BaseModel):
    id: int
    wallet_id: int
    path_index: int
    address: str
    chain: str
    label: Optional[str]
    is_change: bool
    balances: List[TokenBalanceRead] = []

    class Config:
        from_attributes = True


class WalletCreate(BaseModel):
    user_id: str
    name: str
    chain: str
    hd_path: str
    master_pubkey: str
    is_watch_only: bool = False


class WalletRead(BaseModel):
    id: int
    user_id: str
    name: str
    chain: str
    hd_path: str
    master_pubkey: str
    is_watch_only: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionRead(BaseModel):
    id: int
    wallet_id: int
    from_address: str
    to_address: str
    tx_hash: str
    chain: str
    direction: str
    amount: float
    fee: float
    token_symbol: str
    contract_address: Optional[str]
    status: str
    block_number: Optional[int]
    confirmed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionCreate(BaseModel):
    wallet_id: int
    from_address: str
    to_address: str
    tx_hash: str
    chain: str
    direction: str
    amount: float
    fee: float = 0.0
    token_symbol: str = "ETH"
    contract_address: Optional[str] = None
    status: str = "confirmed"
    block_number: Optional[int] = None
    confirmed_at: Optional[datetime] = None


class BalanceSyncItem(BaseModel):
    token_symbol: str
    contract_address: Optional[str] = None
    amount: float
    amount_raw: str = "0"


class BalanceSyncRequest(BaseModel):
    address_id: int
    balances: List[BalanceSyncItem]
