"""Integration tests for the incident endpoints + envelope pagination."""

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


@pytest.fixture()
def building_with_node(client):
    client.post("/auth/register", json={"email": "a@a.co", "password": "abcdefgh"})
    tok = client.post("/auth/login",
                       json={"email": "a@a.co", "password": "abcdefgh"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    bid = client.post("/buildings", json={"name": "B"}, headers=h).json()["id"]
    client.post(f"/buildings/{bid}/nodes",
                json={"node_key": "r1", "type": "room"}, headers=h)
    return bid, h


def test_anonymous_report_then_paginated_list(client, building_with_node):
    bid, _ = building_with_node
    for sev in [0.3, 0.5, 0.8]:
        r = client.post(f"/buildings/{bid}/incidents",
                        json={"node_key": "r1", "incident_type": "fire", "severity": sev})
        assert r.status_code == 201
    body = client.get(f"/buildings/{bid}/incidents?limit=2").json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["limit"] == 2


def test_invalid_incident_type_rejected(client, building_with_node):
    bid, _ = building_with_node
    r = client.post(f"/buildings/{bid}/incidents",
                    json={"node_key": "r1", "incident_type": "monster"})
    assert r.status_code == 400


def test_severity_bounds(client, building_with_node):
    bid, _ = building_with_node
    r = client.post(f"/buildings/{bid}/incidents",
                    json={"node_key": "r1", "incident_type": "fire", "severity": 1.5})
    assert r.status_code == 422


def test_unknown_node_rejected(client, building_with_node):
    bid, _ = building_with_node
    r = client.post(f"/buildings/{bid}/incidents",
                    json={"node_key": "ghost", "incident_type": "fire"})
    assert r.status_code == 400


def test_resolve_requires_operator(client, building_with_node):
    bid, h = building_with_node
    inc = client.post(f"/buildings/{bid}/incidents",
                      json={"node_key": "r1", "incident_type": "fire"}).json()
    # Without token
    assert client.patch(f"/buildings/{bid}/incidents/{inc['id']}").status_code == 401
    # With operator token
    r = client.patch(f"/buildings/{bid}/incidents/{inc['id']}", headers=h)
    assert r.status_code == 200
    assert r.json()["is_active"] is False
