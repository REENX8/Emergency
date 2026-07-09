"""Integration tests for the WebSocket /buildings/{id}/ws stream."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import realtime
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
    # Clear any stale connection buckets from prior tests.
    realtime._connections.clear()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture()
def seeded(client):
    client.post("/auth/register", json={"email": "a@a.co", "password": "abcdefgh"})
    tok = client.post("/auth/login", json={"email": "a@a.co", "password": "abcdefgh"}).json()[
        "access_token"
    ]
    h = {"Authorization": f"Bearer {tok}"}
    bid = client.post("/buildings", json={"name": "B"}, headers=h).json()["id"]
    client.post(f"/buildings/{bid}/nodes", json={"node_key": "r1", "type": "room"}, headers=h)
    return bid, h


def test_ws_receives_incident_created(client, seeded):
    bid, _ = seeded
    with client.websocket_connect(f"/buildings/{bid}/ws") as ws:
        # Direct broadcast — verifies the wire format + dispatch logic.
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            realtime.broadcast(
                bid,
                "incident.created",
                {"id": 1, "node_key": "r1", "incident_type": "fire", "severity": 0.7},
            )
        )
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "incident.created"
        assert msg["payload"]["node_key"] == "r1"
        assert "ts" in msg


def test_ws_receives_event_from_sync_endpoint(client, seeded):
    """End-to-end: a mutation through a *sync* route handler must reach a
    connected WebSocket client. Regression test for the threadpool bug where
    broadcast_sync silently dropped every event (no running loop in the
    worker thread)."""
    bid, _ = seeded
    with client.websocket_connect(f"/buildings/{bid}/ws") as ws:
        resp = client.post(
            f"/buildings/{bid}/incidents",
            json={"node_key": "r1", "incident_type": "fire", "severity": 0.7},
        )
        assert resp.status_code == 201
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "incident.created"
        assert msg["payload"]["node_key"] == "r1"
        assert msg["payload"]["severity"] == 0.7


def test_ws_anonymous_connects(client, seeded):
    bid, _ = seeded
    # No token → still accepted, anonymous reader.
    with client.websocket_connect(f"/buildings/{bid}/ws"):
        assert realtime.active_connections(bid) == 1


def test_active_connections_drops_on_disconnect(client, seeded):
    bid, _ = seeded
    with client.websocket_connect(f"/buildings/{bid}/ws"):
        assert realtime.active_connections(bid) == 1
    # After context exit the bucket should drain.
    # disconnect cleanup runs on the ws-side loop; small grace period.
    import time

    for _ in range(20):
        if realtime.active_connections(bid) == 0:
            break
        time.sleep(0.05)
    assert realtime.active_connections(bid) == 0


def test_broadcast_drops_failed_sockets():
    """Direct unit test of the broadcast bookkeeping path."""
    import asyncio

    class _BadSocket:
        async def send_text(self, _):
            raise RuntimeError("broken")

    realtime._connections.setdefault(999, set()).add(_BadSocket())
    asyncio.get_event_loop().run_until_complete(realtime.broadcast(999, "x.y", {"k": 1}))
    assert realtime.active_connections(999) == 0


def test_broadcast_sync_without_loop_is_noop():
    """Called outside an event loop, broadcast_sync should silently skip
    (not raise) so write endpoints in test contexts don't blow up."""
    # The TestClient runs in its own loop; calling broadcast_sync from
    # plain pytest code (no loop) must be safe.
    realtime.broadcast_sync(1, "x.y", {"k": 1})
