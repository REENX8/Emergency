"""Tests for the in-process graph cache in dynamic_graph.py."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from dynamic_graph import (
    _graph_cache,
    build_graph_from_db,
    invalidate_graph_cache,
)
from models import Building, Edge, Incident, Node


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()
    engine.dispose()


@pytest.fixture(autouse=True)
def _clear_cache():
    invalidate_graph_cache()
    yield
    invalidate_graph_cache()


def _seed_minimal_building(db):
    b = Building(name="t", tmd_station_id="515201")
    db.add(b)
    db.commit()
    db.refresh(b)
    db.add_all([
        Node(building_id=b.id, node_key="a", type="room", x=0, y=0, capacity=10, floor_number=1),
        Node(building_id=b.id, node_key="b", type="exit", x=10, y=0, capacity=10, floor_number=1),
    ])
    db.flush()
    db.add(Edge(building_id=b.id, u_key="a", v_key="b", distance_m=5.0, width_m=2.0, is_stair=False))
    db.commit()
    return b.id


def test_cache_hit_on_second_call(db):
    bid = _seed_minimal_building(db)
    assert bid not in _graph_cache

    g1 = build_graph_from_db(bid, db)
    assert bid in _graph_cache
    # Cached object is the *base* graph; returned object is a deep copy
    assert _graph_cache[bid][1] is not g1

    g2 = build_graph_from_db(bid, db)
    assert g2 is not g1  # always a fresh copy
    assert set(g1.nodes()) == set(g2.nodes())
    assert set(g1.edges()) == set(g2.edges())


def test_cache_invalidates_when_node_added(db):
    bid = _seed_minimal_building(db)
    build_graph_from_db(bid, db)
    version_before = _graph_cache[bid][0]

    db.add(Node(building_id=bid, node_key="c", type="room", x=20, y=0, capacity=5, floor_number=1))
    db.commit()

    g = build_graph_from_db(bid, db)
    assert "c" in g.nodes()
    assert _graph_cache[bid][0] != version_before


def test_cache_invalidates_when_incident_reported(db):
    bid = _seed_minimal_building(db)
    build_graph_from_db(bid, db)
    version_before = _graph_cache[bid][0]

    db.add(Incident(building_id=bid, node_key="a", incident_type="fire", severity=0.8))
    db.commit()

    g = build_graph_from_db(bid, db)
    assert _graph_cache[bid][0] != version_before
    assert g.nodes["a"].get("on_fire") is True


def test_manual_crowd_overrides_dont_pollute_cache(db):
    """Manual crowd densities are applied to a copy — cached base must stay clean."""
    bid = _seed_minimal_building(db)
    g1 = build_graph_from_db(bid, db, crowd_densities={"a": 0.9})
    # Edge weight in the returned graph should reflect crowd override
    w_overridden = g1["a"]["b"]["weight"]

    g2 = build_graph_from_db(bid, db)  # no override
    w_clean = g2["a"]["b"]["weight"]

    assert w_overridden > w_clean, "crowd override should slow the edge down"
    # Cache hit on the second call (same version_key); but its base weight
    # must equal the clean call's weight.
    cached_base = _graph_cache[bid][1]
    assert cached_base["a"]["b"]["weight"] == pytest.approx(w_clean)


def test_explicit_invalidate(db):
    bid = _seed_minimal_building(db)
    build_graph_from_db(bid, db)
    assert bid in _graph_cache
    invalidate_graph_cache(bid)
    assert bid not in _graph_cache
