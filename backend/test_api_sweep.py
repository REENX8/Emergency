"""Integration test for POST /buildings/{id}/experiments/sweep."""

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
def seeded(client):
    client.post("/auth/register", json={"email": "a@a.co", "password": "abcdefgh"})
    tok = client.post("/auth/login",
                      json={"email": "a@a.co", "password": "abcdefgh"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    bid = client.post("/buildings", json={"name": "B"}, headers=h).json()["id"]
    for nk, ntype in [("r1", "room"), ("c1", "corridor"), ("exit1", "exit")]:
        client.post(f"/buildings/{bid}/nodes",
                    json={"node_key": nk, "type": ntype}, headers=h)
    for u, v in [("r1", "c1"), ("c1", "exit1")]:
        client.post(f"/buildings/{bid}/edges",
                    json={"u_key": u, "v_key": v, "distance_m": 10.0, "width_m": 2.0},
                    headers=h)
    return bid


def test_sweep_returns_trials_and_summary(client, seeded):
    bid = seeded
    r = client.post(f"/buildings/{bid}/experiments/sweep", json={
        "fire_location": "r1",
        "variable": "wind_speed",
        "values": [0.0, 5.0],
        "algorithms": ["dijkstra"],
        "repeats": 2,
        "seed": 42,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["trials"]) == 4  # 2 values × 1 algo × 2 repeats
    assert len(body["summary"]["per_cell"]) == 2
    assert "csv" in body


def test_sweep_csv_format(client, seeded):
    bid = seeded
    r = client.post(f"/buildings/{bid}/experiments/sweep?format=csv", json={
        "fire_location": "r1",
        "variable": "fire_severity",
        "values": [0.5, 1.0],
        "algorithms": ["dijkstra"],
        "repeats": 1,
        "seed": 1,
    })
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.text.startswith("variable,value,algorithm,repeat,")


def test_sweep_unknown_variable_returns_400(client, seeded):
    bid = seeded
    r = client.post(f"/buildings/{bid}/experiments/sweep", json={
        "fire_location": "r1",
        "variable": "totally_made_up",
        "values": [0.0],
    })
    assert r.status_code == 400


def test_sweep_unknown_fire_returns_400(client, seeded):
    bid = seeded
    r = client.post(f"/buildings/{bid}/experiments/sweep", json={
        "fire_location": "ghost",
        "variable": "wind_speed",
        "values": [0.0],
    })
    assert r.status_code == 400


def test_sweep_caps_values_list(client, seeded):
    bid = seeded
    r = client.post(f"/buildings/{bid}/experiments/sweep", json={
        "fire_location": "r1",
        "variable": "wind_speed",
        "values": list(range(200)),  # exceeds max_length=100
    })
    assert r.status_code == 422
