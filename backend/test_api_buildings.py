"""Integration tests for the building CRUD endpoints and pagination."""

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
def admin_headers(client):
    client.post("/auth/register", json={"email": "a@a.co", "password": "abcdefgh"})
    tok = client.post("/auth/login",
                       json={"email": "a@a.co", "password": "abcdefgh"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_list_buildings_returns_envelope(client, admin_headers):
    for i in range(3):
        client.post("/buildings", json={"name": f"B{i}"}, headers=admin_headers)
    r = client.get("/buildings", headers=admin_headers)
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    assert body["limit"] == 100
    assert body["offset"] == 0


def test_list_buildings_pagination(client, admin_headers):
    for i in range(5):
        client.post("/buildings", json={"name": f"B{i}"}, headers=admin_headers)
    r = client.get("/buildings?limit=2&offset=1", headers=admin_headers)
    body = r.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
    assert body["limit"] == 2
    assert body["offset"] == 1


def test_list_buildings_no_auth_required(client):
    r = client.get("/buildings")
    assert r.status_code == 200
    assert "items" in r.json()


def test_list_buildings_rejects_bad_pagination(client, admin_headers):
    r = client.get("/buildings?limit=0", headers=admin_headers)
    assert r.status_code == 422
    r = client.get("/buildings?limit=10000", headers=admin_headers)
    assert r.status_code == 422
    r = client.get("/buildings?offset=-1", headers=admin_headers)
    assert r.status_code == 422


def test_create_building_validates_name_length(client, admin_headers):
    r = client.post("/buildings", json={"name": "x" * 500}, headers=admin_headers)
    assert r.status_code == 422


def test_create_building_rejects_empty_name(client, admin_headers):
    r = client.post("/buildings", json={"name": ""}, headers=admin_headers)
    assert r.status_code == 422


def test_node_pagination(client, admin_headers):
    bid = client.post("/buildings", json={"name": "B"},
                       headers=admin_headers).json()["id"]
    for i in range(4):
        r = client.post(f"/buildings/{bid}/nodes",
                        json={"node_key": f"n{i}", "type": "room"},
                        headers=admin_headers)
        assert r.status_code == 201
    body = client.get(f"/buildings/{bid}/nodes?limit=2").json()
    assert body["total"] == 4
    assert len(body["items"]) == 2


def test_node_create_validates_node_key_length(client, admin_headers):
    bid = client.post("/buildings", json={"name": "B"},
                       headers=admin_headers).json()["id"]
    r = client.post(f"/buildings/{bid}/nodes",
                    json={"node_key": "x" * 200, "type": "room"},
                    headers=admin_headers)
    assert r.status_code == 422


def test_import_building_caps_node_list(client, admin_headers):
    # 5001 nodes exceeds max_length=5000
    payload = {
        "name": "Huge",
        "nodes": [{"node_key": f"n{i}", "type": "room"} for i in range(5001)],
        "edges": [],
    }
    r = client.post("/buildings/import", json=payload, headers=admin_headers)
    assert r.status_code == 422


def test_node_capacity_bounds(client, admin_headers):
    bid = client.post("/buildings", json={"name": "B"},
                       headers=admin_headers).json()["id"]
    # Negative capacity rejected.
    r = client.post(f"/buildings/{bid}/nodes",
                    json={"node_key": "n1", "type": "room", "capacity": -5},
                    headers=admin_headers)
    assert r.status_code == 422
    # Beyond upper bound rejected.
    r = client.post(f"/buildings/{bid}/nodes",
                    json={"node_key": "n2", "type": "room", "capacity": 10_000_000},
                    headers=admin_headers)
    assert r.status_code == 422


def test_unauth_write_returns_401(client):
    r = client.post("/buildings", json={"name": "anon"})
    assert r.status_code == 401


def test_edge_self_loop_rejected(client, admin_headers):
    bid = client.post("/buildings", json={"name": "B"},
                       headers=admin_headers).json()["id"]
    client.post(f"/buildings/{bid}/nodes",
                json={"node_key": "n1", "type": "room"}, headers=admin_headers)
    r = client.post(f"/buildings/{bid}/edges",
                    json={"u_key": "n1", "v_key": "n1", "distance_m": 5.0, "width_m": 2.0},
                    headers=admin_headers)
    assert r.status_code == 400
    assert "self-loop" in r.json()["detail"].lower()
