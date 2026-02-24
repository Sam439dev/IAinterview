"""
Authentication Service
Handles password hashing, JWT generation/validation, and user management.
100% autonomous - no external auth providers.
"""
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from passlib.context import CryptContext
import jwt
from pydantic import BaseModel, EmailStr, Field

# Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
REFRESH_TOKEN_EXPIRATION_DAYS = 7

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ========== Pydantic Models ==========

class UserCreate(BaseModel):
    """User registration input."""
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=100)


class UserLogin(BaseModel):
    """User login input."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User data returned to client (no password)."""
    id: str
    email: str
    full_name: str
    created_at: str
    is_active: bool = True


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class PasswordResetRequest(BaseModel):
    """Password reset request."""
    email: EmailStr


class PasswordReset(BaseModel):
    """Password reset with token."""
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


# ========== Password Functions ==========

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ========== JWT Functions ==========

def create_access_token(user_id: str, email: str, extra_data: Dict = None) -> str:
    """Create a JWT access token."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": expire,
        "type": "access"
    }
    
    if extra_data:
        payload.update(extra_data)
    
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """Create a JWT refresh token (longer expiration)."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRATION_DAYS)
    
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": expire,
        "type": "refresh"
    }
    
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify an access token and return payload if valid."""
    payload = decode_token(token)
    if payload and payload.get("type") == "access":
        return payload
    return None


def verify_refresh_token(token: str) -> Optional[str]:
    """Verify a refresh token and return user_id if valid."""
    payload = decode_token(token)
    if payload and payload.get("type") == "refresh":
        return payload.get("sub")
    return None


# ========== Password Reset ==========

def create_password_reset_token(email: str) -> str:
    """Create a password reset token (short expiration)."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=1)  # 1 hour expiration
    
    payload = {
        "email": email,
        "iat": now,
        "exp": expire,
        "type": "password_reset"
    }
    
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_password_reset_token(token: str) -> Optional[str]:
    """Verify a password reset token and return email if valid."""
    payload = decode_token(token)
    if payload and payload.get("type") == "password_reset":
        return payload.get("email")
    return None


# ========== User Serialization ==========

def serialize_user(user_doc: Dict) -> UserResponse:
    """Serialize a MongoDB user document to UserResponse."""
    return UserResponse(
        id=str(user_doc.get("_id", "")),
        email=user_doc.get("email", ""),
        full_name=user_doc.get("full_name", ""),
        created_at=user_doc.get("created_at", ""),
        is_active=user_doc.get("is_active", True)
    )
