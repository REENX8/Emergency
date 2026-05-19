"""Integration tests for the auth router and protected endpoints."""

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
    # Fresh in-memory SQLite per test; StaticPool keeps the same connection
    # so tables created here are visible to FastAPI's get_db().
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        s = TestingSession()
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


def test_register_then_login(client):
    r = client.post("/auth/register", json={"email": "a@b.co", "password": "longenough"})
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "a@b.co"

    r = client.post("/auth/login", json={"email": "a@b.co", "password": "longenough"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    assert token

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "a@b.co"


def test_register_duplicate_email_conflicts(client):
    client.post("/auth/register", json={"email": "x@y.co", "password": "abcdefgh"})
    r = client.post("/auth/register", json={"email": "x@y.co", "password": "abcdefgh"})
    assert r.status_code == 409


def test_login_wrong_password_returns_401(client):
    client.post("/auth/register", json={"email": "u@u.co", "password": "abcdefgh"})
    r = client.post("/auth/login", json={"email": "u@u.co", "password": "WRONG!!!!"})
    assert r.status_code == 401


def test_me_without_token_is_401(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_create_building_requires_auth(client):
    r = client.post("/buildings", json={"name": "anon"})
    assert r.status_code == 401


def test_list_buildings_requires_auth(client):
    # Building list now requires at least viewer auth.
    r = client.get("/buildings")
    assert r.status_code == 401


def test_health_is_public(client):
    assert client.get("/health").status_code == 200


def test_list_buildings_with_auth(client):
    client.post("/auth/register", json={"email": "ad@ad.co", "password": "abcdefgh"})
    tok = client.post("/auth/login", json={"email": "ad@ad.co", "password": "abcdefgh"}).json()["access_token"]
    r = client.get("/buildings", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_create_building_works_with_token(client):
    client.post("/auth/register", json={"email": "ad@ad.co", "password": "abcdefgh"})
    tok = client.post("/auth/login", json={"email": "ad@ad.co", "password": "abcdefgh"}).json()["access_token"]
    r = client.post(
        "/buildings",
        json={"name": "Auth'd"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 201
