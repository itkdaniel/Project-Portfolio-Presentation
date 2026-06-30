from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db_dep
from app.models import WalletTransactionModel, TransactionRead, TransactionCreate

router = APIRouter(prefix="/v1/wallet/transactions", tags=["transactions"])

@router.get("", response_model=List[TransactionRead])
async def list_transactions(
    wallet_id: int = Query(...),
    limit: int = Query(50),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db_dep)
):
    result = await db.execute(
        select(WalletTransactionModel)
        .where(WalletTransactionModel.wallet_id == wallet_id)
        .order_by(WalletTransactionModel.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()

@router.post("", response_model=TransactionRead, status_code=201)
async def record_transaction(
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db_dep)
):
    tx = WalletTransactionModel(**payload.model_dump())
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx

@router.get("/tx/{tx_hash}", response_model=TransactionRead)
async def get_transaction_by_hash(
    tx_hash: str,
    db: AsyncSession = Depends(get_db_dep)
):
    result = await db.execute(
        select(WalletTransactionModel)
        .where(WalletTransactionModel.tx_hash == tx_hash)
    )
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx
