"""Tests for audit.py — append-only audit log helper."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from audit import audit
from database import Base
from models import AuditLog, User


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    s = Session()
    yield s
    s.close()
    engine.dispose()


def _make_user(db, email="op@test.com", role="operator"):
    u = User(email=email, password_hash="hash", role=role)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# ---------------------------------------------------------------------------
# Basic write
# ---------------------------------------------------------------------------


def test_audit_creates_log_entry(db):
    user = _make_user(db)
    audit(
        db, user, "building.create", target_type="building", target_id=1, payload={"name": "Test"}
    )
    entry = db.query(AuditLog).first()
    assert entry is not None
    assert entry.action == "building.create"
    assert entry.actor_email == "op@test.com"
    assert entry.target_type == "building"
    assert entry.target_id == "1"


def test_audit_payload_is_json_serialized(db):
    user = _make_user(db)
    audit(db, user, "node.delete", payload={"node_key": "r101", "count": 3})
    entry = db.query(AuditLog).first()
    parsed = json.loads(entry.payload)
    assert parsed["node_key"] == "r101"
    assert parsed["count"] == 3


def test_audit_with_none_user_stores_null_fields(db):
    audit(db, None, "incident.create")
    entry = db.query(AuditLog).first()
    assert entry is not None
    assert entry.user_id is None
    assert entry.actor_email is None


def test_audit_without_payload(db):
    user = _make_user(db)
    audit(db, user, "building.list")
    entry = db.query(AuditLog).first()
    assert entry.payload == ""


def test_audit_payload_truncated_at_1000_chars(db):
    user = _make_user(db)
    long_payload = {"data": "x" * 2000}
    audit(db, user, "test.action", payload=long_payload)
    entry = db.query(AuditLog).first()
    assert len(entry.payload) <= 1000


def test_audit_does_not_raise_on_db_failure(db):
    """Audit must never propagate exceptions to callers."""
    user = _make_user(db)
    db.close()  # close the session to simulate failure

    # Should not raise
    audit(db, user, "building.create")


def test_audit_multiple_entries_ordered_by_insertion(db):
    user = _make_user(db)
    for action in ("building.create", "node.create", "edge.create"):
        audit(db, user, action)
    entries = db.query(AuditLog).all()
    assert [e.action for e in entries] == ["building.create", "node.create", "edge.create"]


def test_audit_target_id_coerces_int_to_string(db):
    user = _make_user(db)
    audit(db, user, "building.delete", target_id=42)
    entry = db.query(AuditLog).first()
    assert entry.target_id == "42"
