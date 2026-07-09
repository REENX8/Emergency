"""Unit tests for the experiment runner (sweep + reproducibility)."""

import networkx as nx
import pytest

from experiments import SweepRequest, run_sweep
from experiments.metrics import run_trial


def _toy_graph() -> nx.Graph:
    G = nx.Graph()
    G.add_node("r1", type="room", x=0, y=0)
    G.add_node("c1", type="corridor", x=10, y=0)
    G.add_node("exit1", type="exit", x=20, y=0)
    G.add_edge(
        "r1",
        "c1",
        distance=10,
        width=2.0,
        is_stair=False,
        crowd_density=0.0,
        smoke_level=0.0,
        weight=10 / 1.4,
    )
    G.add_edge(
        "c1",
        "exit1",
        distance=10,
        width=2.0,
        is_stair=False,
        crowd_density=0.0,
        smoke_level=0.0,
        weight=10 / 1.4,
    )
    return G


def test_run_trial_returns_metric_for_reachable():
    G = _toy_graph()
    m = run_trial(G, "r1", ["exit1"], "dijkstra", "wind_speed", 0.0, 0)
    assert m.reachable_exits == 1
    assert m.avg_time_s is not None
    assert m.exec_time_ms >= 0


def test_run_trial_handles_missing_fire():
    G = _toy_graph()
    m = run_trial(G, "ghost", ["exit1"], "dijkstra", "wind_speed", 0.0, 0)
    assert m.reachable_exits == 0
    assert m.avg_time_s is None


def test_sweep_basic():
    G = _toy_graph()
    req = SweepRequest(
        fire_location="r1",
        variable="wind_speed",
        values=[0.0, 5.0],
        algorithms=["dijkstra"],
        repeats=2,
        seed=1,
    )
    res = run_sweep(G, ["exit1"], req)
    # 2 values × 1 algorithm × 2 repeats = 4 trials
    assert len(res.trials) == 4
    assert len(res.summary["per_cell"]) == 2
    assert "variable" in res.csv  # CSV header present


def test_sweep_reproducible_with_same_seed():
    G = _toy_graph()
    req = SweepRequest(
        fire_location="r1",
        variable="crowd_density",
        values=[0.3, 0.6, 0.9],
        algorithms=["dijkstra", "astar"],
        repeats=3,
        seed=42,
    )
    res1 = run_sweep(G, ["exit1"], req)
    res2 = run_sweep(G, ["exit1"], req)
    # Compare metric fields (ignore exec_time_ms — wall-clock noise).
    keys = (
        "variable",
        "value",
        "algorithm",
        "repeat",
        "avg_time_s",
        "best_path_hops",
        "reachable_exits",
    )
    a = [{k: t[k] for k in keys} for t in res1.trials]
    b = [{k: t[k] for k in keys} for t in res2.trials]
    assert a == b


def test_sweep_unknown_variable_raises():
    G = _toy_graph()
    req = SweepRequest(fire_location="r1", variable="bad", values=[1], repeats=1)
    with pytest.raises(ValueError):
        run_sweep(G, ["exit1"], req)


def test_sweep_fire_location_variant():
    """The fire_location sweep treats values as indices into fire_locations."""
    G = _toy_graph()
    G.add_node("r2", type="room", x=5, y=5)
    G.add_edge("r2", "c1", distance=5, width=2, crowd_density=0.0, smoke_level=0.0, weight=5 / 1.4)
    req = SweepRequest(
        fire_location="r1",
        fire_locations=["r1", "r2"],
        variable="fire_location",
        values=[0, 1],
        algorithms=["dijkstra"],
        repeats=1,
        seed=7,
    )
    res = run_sweep(G, ["exit1"], req)
    assert len(res.trials) == 2


def _realistic_graph() -> nx.Graph:
    """Graph at real-building scale (~6 px/m, tens of metres) so the seeded
    smoke field near the fire is meaningful but not instantly blocking."""
    G = nx.Graph()
    #   r1 --- c1 --- c2 --- exit1   (rooms/corridors 20 m apart)
    G.add_node("r1", type="room", x=0, y=0)
    G.add_node("c1", type="corridor", x=120, y=0)
    G.add_node("c2", type="corridor", x=240, y=0)
    G.add_node("exit1", type="exit", x=360, y=0)
    for u, v in [("r1", "c1"), ("c1", "c2"), ("c2", "exit1")]:
        G.add_edge(u, v, distance=20, width=2.0, is_stair=False, crowd_density=0.0, weight=20 / 1.4)
    return G


def test_sweep_wind_speed_changes_results():
    """Regression: wind_speed used to be a no-op because the base graph had
    no smoke_level field — every swept value produced identical times."""
    G = _realistic_graph()
    req = SweepRequest(
        fire_location="r1",
        variable="wind_speed",
        values=[0.0, 5.0],
        algorithms=["dijkstra"],
        repeats=1,
        seed=1,
    )
    res = run_sweep(G, ["exit1"], req)
    times = {c["value"]: c["mean_avg_time_s"] for c in res.summary["per_cell"]}
    assert times[0.0] is not None
    # Stronger wind → more smoke on aligned edges → slower (or blocked).
    assert times[5.0] is None or times[5.0] > times[0.0]


def test_sweep_fire_severity_changes_results():
    G = _realistic_graph()
    req = SweepRequest(
        fire_location="r1",
        variable="fire_severity",
        values=[0.1, 0.9],
        algorithms=["dijkstra"],
        repeats=1,
        seed=1,
    )
    res = run_sweep(G, ["exit1"], req)
    times = {c["value"]: c["mean_avg_time_s"] for c in res.summary["per_cell"]}
    assert times[0.1] is not None
    assert times[0.9] is None or times[0.9] > times[0.1]


def test_sweep_does_not_mutate_caller_graph():
    G = _realistic_graph()
    req = SweepRequest(
        fire_location="r1",
        variable="wind_speed",
        values=[5.0],
        algorithms=["dijkstra"],
        repeats=1,
        seed=1,
    )
    run_sweep(G, ["exit1"], req)
    assert all("smoke_level" not in d for _, _, d in G.edges(data=True))


def test_csv_header_present():
    G = _toy_graph()
    req = SweepRequest(
        fire_location="r1",
        variable="wind_speed",
        values=[0.0],
        algorithms=["dijkstra"],
        repeats=1,
        seed=0,
    )
    res = run_sweep(G, ["exit1"], req)
    assert res.csv.startswith("variable,value,algorithm,repeat,")
