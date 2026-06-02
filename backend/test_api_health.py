"""Tests for /health, security headers, and request tracing."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from dynamic_graph import invalidate_graph_cache
from main import app


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    invalidate_graph_cache()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

def test_health_returns_200(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert "service" in body


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------

def test_security_headers_present(client):
    r = client.get("/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert "Referrer-Policy" in r.headers


# ---------------------------------------------------------------------------
# Request tracing
# ---------------------------------------------------------------------------

def test_response_has_request_id(client):
    r = client.get("/health")
    assert "X-Request-ID" in r.headers
    assert len(r.headers["X-Request-ID"]) == 32   # uuid4().hex


def test_client_request_id_echoed_back(client):
    r = client.get("/health", headers={"X-Request-ID": "my-trace-id"})
    assert r.headers.get("X-Request-ID") == "my-trace-id"


def test_process_time_header_present(client):
    r = client.get("/health")
    assert "X-Process-Time-Ms" in r.headers
    assert float(r.headers["X-Process-Time-Ms"]) >= 0


# ---------------------------------------------------------------------------
# Auth edge cases (P1.1)
# ---------------------------------------------------------------------------

def test_login_wrong_password_returns_401(client):
    client.post("/auth/register", json={"email": "u@test.com", "password": "correct-pass"})
    r = client.post("/auth/login", json={"email": "u@test.com", "password": "wrong-pass"})
    assert r.status_code == 401


def test_login_nonexistent_user_returns_401(client):
    r = client.post("/auth/login", json={"email": "ghost@test.com", "password": "whatever"})
    assert r.status_code == 401


def test_access_protected_route_without_token_returns_401(client):
    r = client.post("/buildings", json={"name": "Test"})
    assert r.status_code == 401


def test_access_protected_route_with_invalid_token_returns_401(client):
    r = client.post(
        "/buildings",
        json={"name": "Test"},
        headers={"Authorization": "Bearer totally.invalid.token"},
    )
    assert r.status_code == 401


def test_me_endpoint_with_expired_like_token_returns_401(client):
    """A tampered / truncated token must be rejected."""
    r = client.get("/auth/me", headers={"Authorization": "Bearer eyJ.fake.token"})
    assert r.status_code == 401
