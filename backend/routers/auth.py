"""routers/auth.py — register, login, /me."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from database import get_db
from models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email:    EmailStr = Field(..., json_schema_extra={"example": "user@example.com"})
    password: str      = Field(..., min_length=8,
                               json_schema_extra={"example": "correct horse battery"})


class LoginRequest(BaseModel):
    email:    EmailStr = Field(..., json_schema_extra={"example": "user@example.com"})
    password: str      = Field(..., json_schema_extra={"example": "correct horse battery"})


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"


class UserResponse(BaseModel):
    id:         int
    email:      str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/register", response_model=UserResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(409, detail="Email already registered")
    user = User(email=req.email, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, detail="Invalid email or password")
    return TokenResponse(access_token=create_access_token(sub=user.email))


@router.get("/me", response_model=UserResponse)
def me(current: User = Depends(get_current_user)):
    return current
