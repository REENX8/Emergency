"""
database.py — SQLAlchemy setup (SQLite local / PostgreSQL production)

Set DATABASE_URL env var for PostgreSQL (Supabase):
  DATABASE_URL=postgresql://user:pass@host:5432/dbname
Falls back to SQLite for local development.
"""

import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./evacuation.db")

# Supabase / Heroku connection strings start with "postgres://"; SQLAlchemy needs "postgresql://"
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,      # detect stale connections (Supabase idle timeout)
        pool_recycle=300,        # recycle connections every 5 min
        connect_args={"sslmode": "require", "connect_timeout": 10},
    )
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
    from models import Building, Floor, Node, Edge, Incident, User  # noqa: F401
    Base.metadata.create_all(bind=engine)
    # Migrate: add tmd_station_id to existing databases that pre-date this column
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE buildings ADD COLUMN tmd_station_id VARCHAR DEFAULT '515201'"))
            conn.commit()
        except Exception:
            pass  # column already exists
