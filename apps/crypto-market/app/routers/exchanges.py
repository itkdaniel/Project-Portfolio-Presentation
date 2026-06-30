from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db_dep
from app.models import ExchangeModel, ExchangeRead

router = APIRouter(prefix="/v1/market/exchanges", tags=["exchanges"])

@router.get("", response_model=list[ExchangeRead])
async def list_exchanges(db: AsyncSession = Depends(get_db_dep)):
    stmt = select(ExchangeModel).where(ExchangeModel.is_active == True)
    result = await db.execute(stmt)
    return result.scalars().all()
