"""Integration tests for role-based access control across write endpoints."""

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


def _register(client, email, password="abcdefgh"):
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def _login(client, email, password="abcdefgh"):
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_first_user_becomes_admin(client):
    body = _register(client, "first@x.co")
    assert body["role"] == "admin"


def test_second_user_defaults_to_operator(client):
    _register(client, "first@x.co")
    body = _register(client, "second@x.co")
    assert body["role"] == "operator"


def test_operator_can_create_building(client):
    _register(client, "admin@x.co")
    _register(client, "op@x.co")
    headers = _login(client, "op@x.co")
    r = client.post("/buildings", json={"name": "B1"}, headers=headers)
    assert r.status_code == 201


def test_operator_cannot_delete_building(client):
    _register(client, "admin@x.co")
    admin_h = _login(client, "admin@x.co")
    r = client.post("/buildings", json={"name": "B1"}, headers=admin_h)
    bid = r.json()["id"]

    _register(client, "op@x.co")
    op_h = _login(client, "op@x.co")
    r = client.delete(f"/buildings/{bid}", headers=op_h)
    assert r.status_code == 403
    assert "admin" in r.json()["detail"].lower()


def test_admin_can_delete_building(client):
    _register(client, "admin@x.co")
    admin_h = _login(client, "admin@x.co")
    r = client.post("/buildings", json={"name": "B1"}, headers=admin_h)
    bid = r.json()["id"]
    r = client.delete(f"/buildings/{bid}", headers=admin_h)
    assert r.status_code == 204


def test_admin_can_promote_user(client):
    _register(client, "admin@x.co")
    admin_h = _login(client, "admin@x.co")
    second = _register(client, "op@x.co")

    r = client.patch(f"/auth/users/{second['id']}/role",
                     json={"role": "admin"}, headers=admin_h)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_cannot_demote_last_admin(client):
    _register(client, "admin@x.co")
    admin_h = _login(client, "admin@x.co")
    me = client.get("/auth/me", headers=admin_h).json()
    r = client.patch(f"/auth/users/{me['id']}/role",
                     json={"role": "operator"}, headers=admin_h)
    assert r.status_code == 400


def test_viewer_cannot_create_building(client):
    _register(client, "admin@x.co")
    admin_h = _login(client, "admin@x.co")
    viewer = _register(client, "viewer@x.co")
    client.patch(f"/auth/users/{viewer['id']}/role",
                 json={"role": "viewer"}, headers=admin_h)

    viewer_h = _login(client, "viewer@x.co")
    r = client.post("/buildings", json={"name": "X"}, headers=viewer_h)
    assert r.status_code == 403


def test_non_admin_cannot_list_users(client):
    _register(client, "admin@x.co")
    _register(client, "op@x.co")
    op_h = _login(client, "op@x.co")
    r = client.get("/auth/users", headers=op_h)
    assert r.status_code == 403


def test_anonymous_can_report_incident(client):
    # Bootstrap building + node with admin, then incident anonymously.
    _register(client, "admin@x.co")
    admin_h = _login(client, "admin@x.co")
    bid = client.post("/buildings", json={"name": "B1"}, headers=admin_h).json()["id"]
    client.post(f"/buildings/{bid}/nodes",
                json={"node_key": "r1", "type": "room"}, headers=admin_h)

    r = client.post(f"/buildings/{bid}/incidents",
                    json={"node_key": "r1", "incident_type": "fire", "severity": 0.7})
    assert r.status_code == 201


def test_anonymous_cannot_resolve_incident(client):
    _register(client, "admin@x.co")
    admin_h = _login(client, "admin@x.co")
    bid = client.post("/buildings", json={"name": "B1"}, headers=admin_h).json()["id"]
    client.post(f"/buildings/{bid}/nodes",
                json={"node_key": "r1", "type": "room"}, headers=admin_h)
    inc = client.post(f"/buildings/{bid}/incidents",
                      json={"node_key": "r1", "incident_type": "fire"}).json()
    r = client.patch(f"/buildings/{bid}/incidents/{inc['id']}")
    assert r.status_code == 401
