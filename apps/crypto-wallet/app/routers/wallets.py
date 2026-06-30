from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List

from app.database import get_db_dep
from app.models import WalletModel, WalletRead, WalletCreate, AddressModel, AddressRead

router = APIRouter(prefix="/v1/wallet/wallets", tags=["wallets"])

@router.get("", response_model=List[WalletRead])
async def list_wallets(
    user_id: str = Query(..., description="User UUID required"),
    db: AsyncSession = Depends(get_db_dep)
):
    result = await db.execute(select(WalletModel).where(WalletModel.user_id == user_id))
    return result.scalars().all()

@router.post("", response_model=WalletRead, status_code=201)
async def create_wallet(
    payload: WalletCreate,
    db: AsyncSession = Depends(get_db_dep)
):
    wallet = WalletModel(**payload.model_dump())
    db.add(wallet)
    await db.commit()
    await db.refresh(wallet)
    return wallet

@router.get("/{wallet_id}", response_model=WalletRead)
async def get_wallet(
    wallet_id: int,
    db: AsyncSession = Depends(get_db_dep)
):
    result = await db.execute(
        select(WalletModel)
        .where(WalletModel.id == wallet_id)
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet

@router.delete("/{wallet_id}", status_code=204)
async def delete_wallet(
    wallet_id: int,
    db: AsyncSession = Depends(get_db_dep)
):
    result = await db.execute(select(WalletModel).where(WalletModel.id == wallet_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    
    await db.execute(delete(WalletModel).where(WalletModel.id == wallet_id))
    await db.commit()
    return None
