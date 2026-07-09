"""routers/auth.py — register, login, /me, admin role management."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from audit import audit
from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_role,
    verify_password,
)
from database import get_db
from models import User
from rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["auth"])

VALID_ROLES = {"admin", "operator", "viewer"}


class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., json_schema_extra={"example": "user@example.com"})
    password: str = Field(
        ..., min_length=8, max_length=200, json_schema_extra={"example": "correct horse battery"}
    )


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., json_schema_extra={"example": "user@example.com"})
    password: str = Field(
        ..., max_length=200, json_schema_extra={"example": "correct horse battery"}
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RoleUpdateRequest(BaseModel):
    role: str = Field(..., description="admin / operator / viewer")


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(409, detail="Email already registered")
    # First registered user becomes admin (bootstrap); subsequent users default to operator.
    is_first = db.query(User).count() == 0
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        role="admin" if is_first else "operator",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit(
        db,
        user,
        "user.register",
        target_type="user",
        target_id=user.id,
        payload={"email": user.email, "role": user.role, "bootstrap_admin": is_first},
    )
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, detail="Invalid email or password")
    return TokenResponse(
        access_token=create_access_token(sub=user.email, extra={"role": user.role})
    )


@router.get("/me", response_model=UserResponse)
def me(current: User = Depends(get_current_user)):
    return current


@router.get(
    "/users", response_model=list[UserResponse], dependencies=[Depends(require_role("admin"))]
)
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    payload: RoleUpdateRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role("admin")),
):
    if payload.role not in VALID_ROLES:
        raise HTTPException(400, detail=f"role must be one of {sorted(VALID_ROLES)}")
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, detail="User not found")
    # Prevent removing the last admin.
    if target.role == "admin" and payload.role != "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(400, detail="Cannot demote the last admin")
    old_role = target.role
    target.role = payload.role
    db.commit()
    db.refresh(target)
    audit(
        db,
        actor,
        "user.role.change",
        target_type="user",
        target_id=target.id,
        payload={"from": old_role, "to": payload.role, "target_email": target.email},
    )
    return target
