"""Integration test for SlowAPI rate limiting on login + incident endpoints."""

import importlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture()
def client(monkeypatch):
    # Force-enable rate limiting (other tests disable it).
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "1")

    # Reload modules so the limiter picks up the env var + state is fresh
    # per test (slowapi keeps an in-memory bucket).
    import rate_limit

    importlib.reload(rate_limit)
    import routers.auth
    import routers.incidents

    importlib.reload(routers.auth)
    importlib.reload(routers.incidents)
    import main

    importlib.reload(main)
    from database import Base, get_db
    from dynamic_graph import invalidate_graph_cache
    from main import app

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

    # Reset rate-limit env var + reload modules so subsequent tests
    # in the suite don't get throttled.
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "0")
    importlib.reload(rate_limit)
    importlib.reload(routers.auth)
    importlib.reload(routers.incidents)
    importlib.reload(main)


def test_login_rate_limit_triggers(client):
    # Register one valid user, then hammer login.
    client.post("/auth/register", json={"email": "a@a.co", "password": "abcdefgh"})

    # First ~10 logins succeed (limit is 10/minute), then 429.
    statuses = []
    for _ in range(12):
        r = client.post("/auth/login", json={"email": "a@a.co", "password": "abcdefgh"})
        statuses.append(r.status_code)
    assert 429 in statuses, f"expected at least one 429, got {statuses}"


def test_register_rate_limit_triggers(client):
    # Register cap is 5/minute.
    statuses = []
    for i in range(8):
        r = client.post("/auth/register", json={"email": f"u{i}@x.co", "password": "abcdefgh"})
        statuses.append(r.status_code)
    assert 429 in statuses, f"expected at least one 429, got {statuses}"
