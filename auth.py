# routers/auth.py
# POST /api/auth/sync
#
# Called by the frontend on every app load after the user signs in with Clerk.
# On first login: creates a Household and User row in one transaction.
# On subsequent logins: finds the existing user and returns their household.
# Safe to call repeatedly — it's idempotent.

import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
import httpx

from database import get_db
from models import Household, User
from schemas import AuthSyncOut

router = APIRouter()
bearer_scheme = HTTPBearer()

CLERK_JWKS_URL = os.environ["CLERK_JWKS_URL"]
_jwks_cache: dict = {}

def _get_jwks() -> dict:
    if not _jwks_cache:
        response = httpx.get(CLERK_JWKS_URL)
        response.raise_for_status()
        _jwks_cache.update(response.json())
    return _jwks_cache


@router.post("/auth/sync", response_model=AuthSyncOut)
def auth_sync(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    # Decode the Clerk JWT to get the user's Clerk ID and email
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            _get_jwks(),
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        clerk_user_id: str = payload["sub"]
        email: str = payload.get("email", "")
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid token")

    # Check if this user already exists in our database
    user = db.query(User).filter(User.id == clerk_user_id).first()

    if user:
        # Returning user — just return their existing household info
        return AuthSyncOut(
            user_id=user.id,
            household_id=user.household_id,
            household_name=user.household.name,
            is_new_user=False,
        )

    # First login — create a household and user row together
    # Use the email prefix as the default household name (user can rename it later)
    default_name = email.split("@")[0] if email else "My Household"
    household = Household(name=default_name)
    db.add(household)
    db.flush()  # flush so household.id is populated before we reference it below

    user = User(id=clerk_user_id, email=email, household_id=household.id)
    db.add(user)

    return AuthSyncOut(
        user_id=user.id,
        household_id=household.id,
        household_name=household.name,
        is_new_user=True,
    )
