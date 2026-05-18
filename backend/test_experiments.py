"""Unit tests for the experiment runner (sweep + reproducibility)."""

import networkx as nx
import pytest

from experiments import SweepRequest, run_sweep
from experiments.metrics import run_trial


def _toy_graph() -> nx.Graph:
    G = nx.Graph()
    G.add_node("r1",    type="room",     x=0, y=0)
    G.add_node("c1",    type="corridor", x=10, y=0)
    G.add_node("exit1", type="exit",     x=20, y=0)
    G.add_edge("r1", "c1",
               distance=10, width=2.0, is_stair=False,
               crowd_density=0.0, smoke_level=0.0, weight=10 / 1.4)
    G.add_edge("c1", "exit1",
               distance=10, width=2.0, is_stair=False,
               crowd_density=0.0, smoke_level=0.0, weight=10 / 1.4)
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
    keys = ("variable", "value", "algorithm", "repeat",
            "avg_time_s", "best_path_hops", "reachable_exits")
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
    G.add_edge("r2", "c1", distance=5, width=2,
               crowd_density=0.0, smoke_level=0.0, weight=5/1.4)
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


def test_csv_header_present():
    G = _toy_graph()
    req = SweepRequest(
        fire_location="r1", variable="wind_speed", values=[0.0],
        algorithms=["dijkstra"], repeats=1, seed=0,
    )
    res = run_sweep(G, ["exit1"], req)
    assert res.csv.startswith("variable,value,algorithm,repeat,")
