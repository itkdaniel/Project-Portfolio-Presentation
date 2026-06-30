from __future__ import annotations

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db_dep
from app.models import CryptoUserModel, UserCreate, UserRead, Token
from app.auth import hash_password, verify_password, create_token, require_auth
from app.config import get_settings

router = APIRouter()

@router.post("/register", response_model=Token)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db_dep)
):
    # Check if user exists
    stmt = select(CryptoUserModel).where(
        (CryptoUserModel.username == user_in.username) | 
        (CryptoUserModel.email == user_in.email)
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )
    
    user = CryptoUserModel(
        user_id=str(uuid.uuid4()),
        username=user_in.username,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        is_active=True
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    settings = get_settings()
    token = create_token(user.user_id, user.username, settings.jwt_secret)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/login", response_model=Token)
async def login(
    user_in: UserCreate, # Reusing UserCreate for simplicity in this proto, but usually separate Login schema
    db: AsyncSession = Depends(get_db_dep)
):
    stmt = select(CryptoUserModel).where(CryptoUserModel.email == user_in.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(user_in.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    user.last_login = datetime.now()
    await db.commit()
    
    settings = get_settings()
    token = create_token(user.user_id, user.username, settings.jwt_secret)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=UserRead)
async def get_me(
    current_user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db_dep)
):
    stmt = select(CryptoUserModel).where(CryptoUserModel.user_id == current_user["user_id"])
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
