"""Integration tests for the GET /buildings/{id}/compliance endpoint."""

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
    tok = client.post("/auth/login", json={"email": "a@a.co", "password": "abcdefgh"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _seed_building(client, admin_headers, has_sprinkler=False, stair_width=1.5):
    bid = client.post("/buildings",
                       json={"name": "B", "has_sprinkler": has_sprinkler, "total_floors": 1},
                       headers=admin_headers).json()["id"]
    for nk, ntype in [("r1", "room"), ("c1", "corridor"), ("exit1", "exit")]:
        client.post(f"/buildings/{bid}/nodes",
                    json={"node_key": nk, "type": ntype},
                    headers=admin_headers)
    client.post(f"/buildings/{bid}/edges",
                json={"u_key": "r1", "v_key": "c1", "distance_m": 8, "width_m": 1.8, "is_stair": False},
                headers=admin_headers)
    client.post(f"/buildings/{bid}/edges",
                json={"u_key": "c1", "v_key": "exit1", "distance_m": 5, "width_m": stair_width, "is_stair": True},
                headers=admin_headers)
    return bid


def test_compliance_returns_envelope(client, admin_headers):
    bid = _seed_building(client, admin_headers, has_sprinkler=True, stair_width=1.5)
    r = client.get(f"/buildings/{bid}/compliance")
    assert r.status_code == 200
    body = r.json()
    assert "findings" in body
    assert "summary" in body
    assert "score" in body
    assert "thresholds" in body


def test_compliance_flags_narrow_stair(client, admin_headers):
    bid = _seed_building(client, admin_headers, stair_width=0.8)
    body = client.get(f"/buildings/{bid}/compliance").json()
    rule_ids = [f["rule_id"] for f in body["findings"]]
    assert "stair_width" in rule_ids
    assert body["summary"]["fail"] >= 1
    assert body["score"] < 100


def test_compliance_sprinkler_relaxes_travel_distance(client, admin_headers):
    """With sprinkler the threshold is 60m, without it is 30m. Build a
    45m total path: should fail without sprinkler, pass with it."""
    # No sprinkler — should fail
    bid_no = client.post("/buildings",
                          json={"name": "NoS", "has_sprinkler": False, "total_floors": 1},
                          headers=admin_headers).json()["id"]
    for nk, ntype in [("r1", "room"), ("exit1", "exit")]:
        client.post(f"/buildings/{bid_no}/nodes",
                    json={"node_key": nk, "type": ntype}, headers=admin_headers)
    client.post(f"/buildings/{bid_no}/edges",
                json={"u_key": "r1", "v_key": "exit1", "distance_m": 45, "width_m": 2},
                headers=admin_headers)
    no_sprinkler = client.get(f"/buildings/{bid_no}/compliance").json()
    assert any(f["rule_id"] == "travel_distance" for f in no_sprinkler["findings"])

    # With sprinkler — should pass on the travel-distance rule
    bid_s = client.post("/buildings",
                        json={"name": "Sprink", "has_sprinkler": True, "total_floors": 1},
                        headers=admin_headers).json()["id"]
    for nk, ntype in [("r1", "room"), ("exit1", "exit")]:
        client.post(f"/buildings/{bid_s}/nodes",
                    json={"node_key": nk, "type": ntype}, headers=admin_headers)
    client.post(f"/buildings/{bid_s}/edges",
                json={"u_key": "r1", "v_key": "exit1", "distance_m": 45, "width_m": 2},
                headers=admin_headers)
    sprink = client.get(f"/buildings/{bid_s}/compliance").json()
    assert not any(f["rule_id"] == "travel_distance" for f in sprink["findings"])


def test_compliance_missing_building_returns_404(client):
    assert client.get("/buildings/999/compliance").status_code == 404


def test_patch_building_updates_metadata(client, admin_headers):
    bid = client.post("/buildings", json={"name": "B"},
                      headers=admin_headers).json()["id"]
    r = client.patch(f"/buildings/{bid}",
                     json={"has_sprinkler": True, "total_floors": 5},
                     headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["has_sprinkler"] is True
    assert body["total_floors"] == 5


def test_node_create_accepts_area_m2(client, admin_headers):
    bid = client.post("/buildings", json={"name": "B"},
                      headers=admin_headers).json()["id"]
    r = client.post(f"/buildings/{bid}/nodes",
                    json={"node_key": "r1", "type": "room", "area_m2": 25.0},
                    headers=admin_headers)
    assert r.status_code == 201
    assert r.json()["area_m2"] == 25.0
