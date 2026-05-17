"""
auth.py — password hashing, JWT issuance/verification, FastAPI dependency

Endpoints that require an authenticated user use the `get_current_user`
dependency. JWT secret is read from the `JWT_SECRET` env var; in dev a
sensible default is used (warning logged).

Algorithm: HS256
Expiry:    24 hours
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24


def _resolve_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        logger.warning(
            "JWT_SECRET not set — using a dev-only fallback. "
            "Set JWT_SECRET to a random 32+ char string in production."
        )
        return "dev-secret-do-not-use-in-production"
    return secret


JWT_SECRET = _resolve_secret()

# `bcrypt__truncate_error=False` keeps backward compatibility with the
# bcrypt 72-byte limit without raising on long passphrases.
pwd_ctx = CryptContext(
    schemes=["bcrypt"], deprecated="auto", bcrypt__truncate_error=False,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(sub: str, extra: Optional[dict] = None) -> str:
    payload = {
        "sub": sub,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency — resolves the User row from the bearer token.

    Raises 401 if the token is missing, expired, malformed, or refers to a
    user that no longer exists.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _decode_token(token)
    email = payload.get("sub")
    if not email:
        raise HTTPException(401, "Token has no subject")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(401, "User no longer exists")
    return user


# Role hierarchy — higher index implies all permissions of lower indices.
_ROLE_RANK = {"viewer": 0, "operator": 1, "admin": 2}


def role_at_least(user_role: str, required: str) -> bool:
    return _ROLE_RANK.get(user_role, -1) >= _ROLE_RANK.get(required, 99)


def require_role(min_role: str):
    """FastAPI dependency factory — 401 if no token, 403 if role < min_role.

    Usage:
        @router.post("/x", dependencies=[Depends(require_role("operator"))])
    """
    if min_role not in _ROLE_RANK:
        raise ValueError(f"Unknown role: {min_role}")

    def _dep(user: User = Depends(get_current_user)) -> User:
        if not role_at_least(user.role, min_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role '{min_role}' or higher (have '{user.role}')",
            )
        return user

    return _dep
