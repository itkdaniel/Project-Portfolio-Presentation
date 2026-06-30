from __future__ import annotations

import hashlib
import hmac
import secrets
import json
import base64
import time
from datetime import datetime, timedelta
from typing import Optional, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hash_obj = hashlib.sha256((salt + password).encode())
    return f"{salt}:{hash_obj.hexdigest()}"


def verify_password(password: str, hashed: str) -> bool:
    if ":" not in hashed:
        return False
    salt, original_hash = hashed.split(":", 1)
    new_hash = hashlib.sha256((salt + password).encode()).hexdigest()
    return hmac.compare_digest(original_hash, new_hash)


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def base64url_decode(data: str) -> bytes:
    padding = "=" * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)


def create_token(user_id: str, username: str, secret: str, expiry_hours: int = 24) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": int(time.time() + expiry_hours * 3600)
    }

    header_b64 = base64url_encode(json.dumps(header).encode())
    payload_b64 = base64url_encode(json.dumps(payload).encode())

    signing_input = f"{header_b64}.{payload_b64}".encode()
    signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def decode_token(token: str, secret: str) -> dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid token format")

        header_b64, payload_b64, signature_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode()
        
        expected_signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
        actual_signature = base64url_decode(signature_b64)

        if not hmac.compare_digest(expected_signature, actual_signature):
            raise ValueError("Invalid signature")

        payload = json.loads(base64url_decode(payload_b64).decode())
        if payload.get("exp", 0) < time.time():
            raise ValueError("Token expired")

        return payload
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e) or "Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    auth: HTTPAuthorizationCredentials = Depends(security)
) -> dict[str, Any]:
    from app.config import get_settings
    settings = get_settings()
    return decode_token(auth.credentials, settings.jwt_secret)


async def require_auth(
    user_data: dict[str, Any] = Depends(get_current_user)
) -> dict[str, Any]:
    return user_data
