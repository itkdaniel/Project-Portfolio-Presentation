from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_db_dep
from app.models import TokenBalanceModel, TokenBalanceRead, BalanceSyncRequest, AddressModel

router = APIRouter(prefix="/v1/wallet/balances", tags=["balances"])

@router.get("", response_model=List[TokenBalanceRead])
async def list_balances(
    wallet_id: int = Query(...),
    db: AsyncSession = Depends(get_db_dep)
):
    # Get all addresses for the wallet
    addr_ids_query = select(AddressModel.id).where(AddressModel.wallet_id == wallet_id)
    addr_ids_result = await db.execute(addr_ids_query)
    addr_ids = addr_ids_result.scalars().all()
    
    if not addr_ids:
        return []

    result = await db.execute(
        select(TokenBalanceModel)
        .where(TokenBalanceModel.address_id.in_(addr_ids))
    )
    return result.scalars().all()

@router.post("/sync", status_code=200)
async def sync_balances(
    payload: BalanceSyncRequest,
    db: AsyncSession = Depends(get_db_dep)
):
    # Verify address exists
    addr_result = await db.execute(select(AddressModel).where(AddressModel.id == payload.address_id))
    if not addr_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Address not found")
        
    # Delete existing balances for this address
    await db.execute(delete(TokenBalanceModel).where(TokenBalanceModel.address_id == payload.address_id))
    
    # Add new balances
    for item in payload.balances:
        balance = TokenBalanceModel(
            address_id=payload.address_id,
            token_symbol=item.token_symbol,
            contract_address=item.contract_address,
            amount=item.amount,
            amount_raw=item.amount_raw
        )
        db.add(balance)
        
    await db.commit()
    return {"status": "success", "synced": len(payload.balances)}
