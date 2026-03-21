# auth.py
# Validates Clerk JWTs on every protected request.
#
# How it works:
#   1. The frontend attaches the Clerk JWT to every request as:
#      Authorization: Bearer <token>
#   2. get_current_user() extracts and decodes that token.
#   3. It verifies the token is genuine by checking it against Clerk's
#      public keys (fetched once from CLERK_JWKS_URL and cached).
#   4. It looks up the user row in our database by the Clerk user ID.
#   5. If any step fails, it raises a 401 — the endpoint never runs.
#
# Every protected endpoint declares this as a dependency:
#   def my_endpoint(current_user: User = Depends(get_current_user)):

import os
import httpx
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models import User

CLERK_JWKS_URL = os.environ["CLERK_JWKS_URL"]

# HTTPBearer tells FastAPI to look for "Authorization: Bearer <token>"
bearer_scheme = HTTPBearer()

# Cache the public keys so we don't call Clerk on every single request.
# In production you'd refresh this periodically; for the POC a simple
# module-level dict is fine.
_jwks_cache: dict = {}


def _get_jwks() -> dict:
    if not _jwks_cache:
        response = httpx.get(CLERK_JWKS_URL)
        response.raise_for_status()
        _jwks_cache.update(response.json())
    return _jwks_cache


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )

    try:
        # Decode and verify the JWT using Clerk's public keys
        payload = jwt.decode(
            token,
            _get_jwks(),
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk doesn't always set aud
        )
        clerk_user_id: str = payload.get("sub")
        if clerk_user_id is None:
            raise credentials_error
    except JWTError:
        raise credentials_error

    # Look up the user in our database
    user = db.query(User).filter(User.id == clerk_user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found — call /api/auth/sync first",
        )

    return user
