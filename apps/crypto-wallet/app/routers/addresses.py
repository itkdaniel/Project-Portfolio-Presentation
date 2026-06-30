from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_db_dep
from app.models import AddressModel, AddressRead, TokenBalanceModel

router = APIRouter(prefix="/v1/wallet/addresses", tags=["addresses"])

@router.get("/{wallet_id}", response_model=List[AddressRead])
async def list_addresses(
    wallet_id: int,
    db: AsyncSession = Depends(get_db_dep)
):
    result = await db.execute(
        select(AddressModel)
        .where(AddressModel.wallet_id == wallet_id)
        .options(selectinload(AddressModel.balances))
    )
    return result.scalars().all()

@router.post("", response_model=AddressRead, status_code=201)
async def create_address(
    wallet_id: int,
    path_index: int,
    address: str,
    chain: str,
    label: str = None,
    is_change: bool = False,
    db: AsyncSession = Depends(get_db_dep)
):
    # Verify address doesn't exist
    existing = await db.execute(select(AddressModel).where(AddressModel.address == address))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Address already exists")
        
    addr = AddressModel(
        wallet_id=wallet_id,
        path_index=path_index,
        address=address,
        chain=chain,
        label=label,
        is_change=is_change
    )
    db.add(addr)
    await db.commit()
    await db.refresh(addr)
    
    # Reload with balances
    result = await db.execute(
        select(AddressModel)
        .where(AddressModel.id == addr.id)
        .options(selectinload(AddressModel.balances))
    )
    return result.scalar_one()

@router.get("/{wallet_id}/balance")
async def get_aggregate_balance(
    wallet_id: int,
    db: AsyncSession = Depends(get_db_dep)
):
    # Get all addresses for the wallet
    addr_ids_query = select(AddressModel.id).where(AddressModel.wallet_id == wallet_id)
    addr_ids_result = await db.execute(addr_ids_query)
    addr_ids = addr_ids_result.scalars().all()
    
    if not addr_ids:
        return []

    # Aggregate by token_symbol
    balance_query = (
        select(
            TokenBalanceModel.token_symbol,
            func.sum(TokenBalanceModel.amount).label("total_amount")
        )
        .where(TokenBalanceModel.address_id.in_(addr_ids))
        .group_by(TokenBalanceModel.token_symbol)
    )
    
    result = await db.execute(balance_query)
    return [{"token_symbol": r[0], "total_amount": r[1]} for r in result.all()]
