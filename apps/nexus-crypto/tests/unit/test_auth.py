import pytest
from app.auth import hash_password, verify_password, create_token, decode_token

def test_password_hashing():
    password = "MySecurePassword123!"
    hashed = hash_password(password)
    assert hashed != password
    assert ":" in hashed
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)

def test_token_lifecycle():
    secret = "test-secret-key"
    user_id = "user-123"
    username = "testuser"
    
    token = create_token(user_id, username, secret, expiry_hours=1)
    assert token.count(".") == 2
    
    decoded = decode_token(token, secret)
    assert decoded["user_id"] == user_id
    assert decoded["username"] == username
    assert "exp" in decoded

def test_invalid_token():
    secret = "test-secret-key"
    token = "invalid.token.format"
    with pytest.raises(Exception):
        decode_token(token, secret)

def test_expired_token():
    secret = "test-secret-key"
    token = create_token("uid", "uname", secret, expiry_hours=-1)
    with pytest.raises(Exception) as excinfo:
        decode_token(token, secret)
    assert "expired" in str(excinfo.value).lower()
