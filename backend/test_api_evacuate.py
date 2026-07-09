"""Integration tests for the evacuation endpoints + input validation."""

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
def building_with_graph(client):
    """Seed a 3-node line building: r1 — c1 — exit1."""
    client.post("/auth/register", json={"email": "a@a.co", "password": "abcdefgh"})
    tok = client.post("/auth/login", json={"email": "a@a.co", "password": "abcdefgh"}).json()[
        "access_token"
    ]
    h = {"Authorization": f"Bearer {tok}"}
    bid = client.post("/buildings", json={"name": "B"}, headers=h).json()["id"]
    for nk, ntype in [("r1", "room"), ("c1", "corridor"), ("exit1", "exit")]:
        client.post(f"/buildings/{bid}/nodes", json={"node_key": nk, "type": ntype}, headers=h)
    for u, v in [("r1", "c1"), ("c1", "exit1")]:
        client.post(
            f"/buildings/{bid}/edges",
            json={"u_key": u, "v_key": v, "distance_m": 10.0, "width_m": 2.0},
            headers=h,
        )
    return bid


def test_evacuate_basic(client, building_with_graph):
    bid = building_with_graph
    r = client.post(
        f"/buildings/{bid}/evacuate",
        json={
            "fire_location": "r1",
            "use_weather_wind": False,
            "manual_wind_speed": 0.0,
            "manual_wind_direction": 0.0,
            "compare_algorithms": False,
            "algorithm": "dijkstra",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fire_location"] == "r1"
    assert "primary_routes" in body


def test_evacuate_rejects_unknown_fire(client, building_with_graph):
    bid = building_with_graph
    r = client.post(
        f"/buildings/{bid}/evacuate",
        json={
            "fire_location": "nope",
            "use_weather_wind": False,
            "manual_wind_speed": 0.0,
            "manual_wind_direction": 0.0,
            "compare_algorithms": False,
        },
    )
    assert r.status_code == 400
    assert "not in building graph" in r.json()["detail"]


def test_evacuate_caps_crowd_list(client, building_with_graph):
    bid = building_with_graph
    huge = [{"node_key": f"n{i}", "density": 0.5} for i in range(501)]
    r = client.post(
        f"/buildings/{bid}/evacuate",
        json={
            "fire_location": "r1",
            "crowd_densities": huge,
        },
    )
    assert r.status_code == 422


def test_evacuate_validates_density_range(client, building_with_graph):
    bid = building_with_graph
    r = client.post(
        f"/buildings/{bid}/evacuate",
        json={
            "fire_location": "r1",
            "crowd_densities": [{"node_key": "c1", "density": 2.0}],
        },
    )
    assert r.status_code == 422


def test_evacuate_missing_building_returns_404(client):
    r = client.post(
        "/buildings/999/evacuate",
        json={
            "fire_location": "r1",
        },
    )
    assert r.status_code == 404


def test_compare_endpoint(client, building_with_graph):
    bid = building_with_graph
    r = client.post(
        f"/buildings/{bid}/evacuate/compare",
        json={
            "fire_location": "r1",
            "use_weather_wind": False,
            "manual_wind_speed": 0.0,
            "manual_wind_direction": 0.0,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "comparison" in body
