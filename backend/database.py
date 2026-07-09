"""
database.py — SQLAlchemy setup (SQLite local / PostgreSQL production)

Set DATABASE_URL env var for PostgreSQL (Supabase):
  DATABASE_URL=postgresql://user:pass@host:5432/dbname
Falls back to SQLite for local development.
"""

import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

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
        pool_pre_ping=True,  # detect stale connections (Supabase idle timeout)
        pool_recycle=300,  # recycle connections every 5 min
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


def get_db_health() -> tuple[bool, str]:
    """Return (ok, detail) by executing a trivial DB query."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, ""
    except Exception as exc:
        return False, str(exc)


def init_db():
    # Production deploys should run `alembic upgrade head` instead — this
    # create_all + ALTER fallbacks exist so tests + first-time dev runs work
    # without an Alembic env.
    from models import AuditLog, Building, Edge, Floor, Incident, Node, User  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        for stmt in (
            "ALTER TABLE buildings ADD COLUMN tmd_station_id VARCHAR DEFAULT '515201'",
            "ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'operator'",
            "ALTER TABLE buildings ADD COLUMN has_sprinkler BOOLEAN NOT NULL DEFAULT 0",
            "ALTER TABLE buildings ADD COLUMN building_type VARCHAR NOT NULL DEFAULT 'office'",
            "ALTER TABLE buildings ADD COLUMN total_floors INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE nodes ADD COLUMN area_m2 FLOAT",
        ):
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists
