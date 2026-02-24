"""
Authentication Routes
Endpoints for user registration, login, token refresh, and password reset.
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from datetime import datetime, timezone

from services.auth_service import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    PasswordResetRequest, PasswordReset,
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    verify_access_token, verify_refresh_token,
    create_password_reset_token, verify_password_reset_token,
    serialize_user, JWT_EXPIRATION_HOURS
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Database will be injected from main app
users_col = None


def set_users_collection(collection):
    """Set the users collection from the main app."""
    global users_col
    users_col = collection


async def get_current_user(authorization: str = Header(None)) -> dict:
    """
    Dependency to get current authenticated user from JWT token.
    Usage: current_user: dict = Depends(get_current_user)
    """
    if not authorization:
        raise HTTPException(401, "Authorization header required")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid authorization format. Use: Bearer <token>")
    
    token = authorization.replace("Bearer ", "")
    payload = verify_access_token(token)
    
    if not payload:
        raise HTTPException(401, "Invalid or expired token")
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")
    
    # Fetch user from database
    from bson import ObjectId
    user = await users_col.find_one({"_id": ObjectId(user_id)})
    
    if not user:
        raise HTTPException(401, "User not found")
    
    if not user.get("is_active", True):
        raise HTTPException(403, "Account is deactivated")
    
    return user


async def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """
    Optional authentication - returns None if not authenticated.
    Useful for routes that work both with and without auth.
    """
    if not authorization:
        return None
    
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None


# ========== Registration ==========

@router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate):
    """
    Register a new user.
    Returns JWT tokens on successful registration.
    """
    if users_col is None:
        raise HTTPException(500, "Database not configured")
    
    # Check if email already exists
    existing = await users_col.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    
    # Create user document
    now = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "full_name": data.full_name.strip(),
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        "email_verified": False,
        "last_login": None
    }
    
    result = await users_col.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Generate tokens
    access_token = create_access_token(user_id, data.email.lower())
    refresh_token = create_refresh_token(user_id)
    
    # Update last login
    await users_col.update_one(
        {"_id": result.inserted_id},
        {"$set": {"last_login": now}}
    )
    
    user_doc["_id"] = result.inserted_id
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=JWT_EXPIRATION_HOURS * 3600,
        user=serialize_user(user_doc)
    )


# ========== Login ==========

@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    """
    Login with email and password.
    Returns JWT tokens on successful authentication.
    """
    if users_col is None:
        raise HTTPException(500, "Database not configured")
    
    # Find user by email
    user = await users_col.find_one({"email": data.email.lower()})
    
    if not user:
        raise HTTPException(401, "Invalid email or password")
    
    # Verify password
    if not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    
    # Check if account is active
    if not user.get("is_active", True):
        raise HTTPException(403, "Account is deactivated")
    
    user_id = str(user["_id"])
    
    # Generate tokens
    access_token = create_access_token(user_id, user["email"])
    refresh_token = create_refresh_token(user_id)
    
    # Update last login
    now = datetime.now(timezone.utc).isoformat()
    await users_col.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": now}}
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=JWT_EXPIRATION_HOURS * 3600,
        user=serialize_user(user)
    )


# ========== Token Refresh ==========

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(refresh_token: str):
    """
    Get new access token using refresh token.
    """
    if users_col is None:
        raise HTTPException(500, "Database not configured")
    
    user_id = verify_refresh_token(refresh_token)
    
    if not user_id:
        raise HTTPException(401, "Invalid or expired refresh token")
    
    # Fetch user
    from bson import ObjectId
    user = await users_col.find_one({"_id": ObjectId(user_id)})
    
    if not user:
        raise HTTPException(401, "User not found")
    
    if not user.get("is_active", True):
        raise HTTPException(403, "Account is deactivated")
    
    # Generate new tokens
    new_access_token = create_access_token(user_id, user["email"])
    new_refresh_token = create_refresh_token(user_id)
    
    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=JWT_EXPIRATION_HOURS * 3600,
        user=serialize_user(user)
    )


# ========== Get Current User ==========

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    Get current authenticated user's profile.
    """
    return serialize_user(current_user)


# ========== Password Reset Request ==========

@router.post("/password-reset-request")
async def request_password_reset(data: PasswordResetRequest):
    """
    Request a password reset email.
    Always returns success to prevent email enumeration.
    """
    if users_col is None:
        raise HTTPException(500, "Database not configured")
    
    user = await users_col.find_one({"email": data.email.lower()})
    
    if user:
        # Generate reset token
        reset_token = create_password_reset_token(data.email.lower())
        
        # In production, send email here
        # For now, we'll return the token (remove in production!)
        print(f"[AUTH] Password reset token for {data.email}: {reset_token}")
        
        # Store reset token in database
        await users_col.update_one(
            {"_id": user["_id"]},
            {"$set": {"password_reset_token": reset_token}}
        )
    
    # Always return success (security: don't reveal if email exists)
    return {"message": "If the email exists, a password reset link has been sent"}


# ========== Password Reset ==========

@router.post("/password-reset")
async def reset_password(data: PasswordReset):
    """
    Reset password using reset token.
    """
    if users_col is None:
        raise HTTPException(500, "Database not configured")
    
    email = verify_password_reset_token(data.token)
    
    if not email:
        raise HTTPException(400, "Invalid or expired reset token")
    
    # Find user and verify token matches
    user = await users_col.find_one({
        "email": email.lower(),
        "password_reset_token": data.token
    })
    
    if not user:
        raise HTTPException(400, "Invalid or expired reset token")
    
    # Update password
    now = datetime.now(timezone.utc).isoformat()
    await users_col.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(data.new_password),
                "updated_at": now,
                "password_reset_token": None  # Invalidate token
            }
        }
    )
    
    return {"message": "Password has been reset successfully"}


# ========== Logout (optional - for token blacklisting) ==========

@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """
    Logout user. 
    Note: JWT tokens are stateless, so this is mainly for audit logging.
    For true token invalidation, implement a token blacklist.
    """
    # Log the logout event
    now = datetime.now(timezone.utc).isoformat()
    await users_col.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"last_logout": now}}
    )
    
    return {"message": "Logged out successfully"}


# ========== Update Profile ==========

@router.put("/profile")
async def update_profile(
    full_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Update user profile.
    """
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if full_name:
        updates["full_name"] = full_name.strip()
    
    if len(updates) > 1:  # More than just updated_at
        await users_col.update_one(
            {"_id": current_user["_id"]},
            {"$set": updates}
        )
    
    # Fetch updated user
    from bson import ObjectId
    user = await users_col.find_one({"_id": current_user["_id"]})
    
    return serialize_user(user)


# ========== Change Password ==========

@router.post("/change-password")
async def change_password(
    current_password: str,
    new_password: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Change password (requires current password).
    """
    # Verify current password
    if not verify_password(current_password, current_user.get("password_hash", "")):
        raise HTTPException(400, "Current password is incorrect")
    
    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    
    # Update password
    now = datetime.now(timezone.utc).isoformat()
    await users_col.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(new_password),
                "updated_at": now
            }
        }
    )
    
    return {"message": "Password changed successfully"}
