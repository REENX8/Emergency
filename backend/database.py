"""
database.py — SQLAlchemy setup (SQLite local / PostgreSQL production)

Set DATABASE_URL env var for PostgreSQL (Supabase):
  DATABASE_URL=postgresql://user:pass@host:5432/dbname
Falls back to SQLite for local development.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./evacuation.db")

# Supabase / Heroku connection strings start with "postgres://"; SQLAlchemy needs "postgresql://"
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")
_kwargs = {"connect_args": {"check_same_thread": False}} if _is_sqlite else {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, **_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from models import Building, Floor, Node, Edge, Incident  # noqa: F401
    Base.metadata.create_all(bind=engine)
