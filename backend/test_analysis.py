"""
test_analysis.py — Tests for connectivity, bottleneck, safety score,
                   max-flow distribution, and experiment runner.
"""

import math

import networkx as nx
import pytest

from analysis import (
    check_connectivity,
    compute_maxflow_distribution,
    compute_safety_score,
    find_bottlenecks,
    run_experiments,
)

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


def make_triangle() -> nx.Graph:
    """A → B → C → A: fully connected, no bridges."""
    G = nx.Graph()
    attrs = {"x": 0, "y": 0, "type": "room", "capacity": 20}
    for n in ("A", "B", "C"):
        G.add_node(n, **attrs)
    G.add_edge(
        "A",
        "B",
        weight=1.0,
        width=2.0,
        distance=10.0,
        base_time=1.0,
        crowd_density=0.0,
        is_stair=False,
    )
    G.add_edge(
        "B",
        "C",
        weight=1.0,
        width=2.0,
        distance=10.0,
        base_time=1.0,
        crowd_density=0.0,
        is_stair=False,
    )
    G.add_edge(
        "C",
        "A",
        weight=1.0,
        width=2.0,
        distance=10.0,
        base_time=1.0,
        crowd_density=0.0,
        is_stair=False,
    )
    return G


def make_bridge_graph() -> nx.Graph:
    """A − B − C where B is an articulation point and both edges are bridges."""
    G = nx.Graph()
    for n, x in [("A", 0), ("B", 60), ("C", 120)]:
        G.add_node(n, x=x, y=0, type="room", capacity=20)
    G.add_edge(
        "A",
        "B",
        weight=2.0,
        width=2.0,
        distance=10.0,
        base_time=2.0,
        crowd_density=0.0,
        is_stair=False,
    )
    G.add_edge(
        "B",
        "C",
        weight=3.0,
        width=2.0,
        distance=15.0,
        base_time=3.0,
        crowd_density=0.0,
        is_stair=False,
    )
    return G


def make_building_graph() -> nx.Graph:
    """Simple 2-room 1-corridor 1-exit building for evacuation tests."""
    G = nx.Graph()
    nodes = [
        ("r1", {"x": 0, "y": 0, "type": "room", "capacity": 20}),
        ("r2", {"x": 120, "y": 0, "type": "room", "capacity": 20}),
        ("c1", {"x": 60, "y": 0, "type": "corridor", "capacity": 50}),
        ("exit", {"x": 60, "y": -60, "type": "exit", "capacity": 100}),
    ]
    G.add_nodes_from(nodes)
    G.add_edge(
        "r1",
        "c1",
        weight=5.0,
        width=2.0,
        distance=10.0,
        base_time=5.0,
        crowd_density=0.0,
        is_stair=False,
    )
    G.add_edge(
        "r2",
        "c1",
        weight=5.0,
        width=2.0,
        distance=10.0,
        base_time=5.0,
        crowd_density=0.0,
        is_stair=False,
    )
    G.add_edge(
        "c1",
        "exit",
        weight=3.0,
        width=3.0,
        distance=8.0,
        base_time=3.0,
        crowd_density=0.0,
        is_stair=False,
    )
    return G


# ---------------------------------------------------------------------------
# Connectivity tests
# ---------------------------------------------------------------------------


class TestCheckConnectivity:
    def test_connected_graph(self):
        G = make_triangle()
        result = check_connectivity(G)
        assert result["is_connected"] is True
        assert result["num_components"] == 1
        assert result["unreachable_nodes"] == []

    def test_disconnected_after_edge_removal(self):
        G = make_bridge_graph()
        result = check_connectivity(G, blocked_edges=[("A", "B")])
        assert result["is_connected"] is False
        assert result["num_components"] == 2
        assert "A" in result["unreachable_nodes"]

    def test_empty_blocked_edges(self):
        G = make_bridge_graph()
        result = check_connectivity(G, blocked_edges=[])
        assert result["is_connected"] is True

    def test_components_sorted_largest_first(self):
        G = make_bridge_graph()
        result = check_connectivity(G, blocked_edges=[("A", "B")])
        # Largest component has B and C (2 nodes), smaller has just A
        assert len(result["components"][0]) >= len(result["components"][1])

    def test_blocking_nonexistent_edge_is_safe(self):
        G = make_triangle()
        result = check_connectivity(G, blocked_edges=[("X", "Y")])
        assert result["is_connected"] is True


# ---------------------------------------------------------------------------
# Bottleneck tests
# ---------------------------------------------------------------------------


class TestFindBottlenecks:
    def test_no_bridges_in_triangle(self):
        G = make_triangle()
        result = find_bottlenecks(G)
        assert result["bridge_edges"] == []
        assert result["articulation_points"] == []
        assert result["severity"] == 0.0

    def test_all_edges_are_bridges_in_path(self):
        G = make_bridge_graph()
        result = find_bottlenecks(G)
        # Both edges A-B and B-C are bridges
        assert len(result["bridge_edges"]) == 2
        assert "B" in result["articulation_points"]

    def test_severity_range(self):
        for G in (make_triangle(), make_bridge_graph()):
            result = find_bottlenecks(G)
            assert 0.0 <= result["severity"] <= 1.0

    def test_min_edge_cut_connected(self):
        G = make_triangle()
        result = find_bottlenecks(G)
        # Triangle has min-cut of 2 (need to remove 2 edges to disconnect)
        assert result["min_edge_cut_size"] >= 1

    def test_returns_required_keys(self):
        G = make_building_graph()
        result = find_bottlenecks(G)
        for key in (
            "bridge_edges",
            "articulation_points",
            "min_edge_cut_size",
            "min_edge_cut",
            "severity",
        ):
            assert key in result


# ---------------------------------------------------------------------------
# Safety score tests
# ---------------------------------------------------------------------------


class TestComputeSafetyScore:
    def test_score_in_range(self):
        G = make_building_graph()
        result = compute_safety_score(G)
        assert 0 <= result["score"] <= 100

    def test_more_exits_higher_score(self):
        G_one = make_building_graph()  # 1 exit, 4 nodes
        G_two = make_building_graph()
        G_two.add_node("exit2", x=100, y=-60, type="exit", capacity=100)
        G_two.add_edge(
            "c1",
            "exit2",
            weight=3.0,
            width=3.0,
            distance=8.0,
            base_time=3.0,
            crowd_density=0.0,
            is_stair=False,
        )
        score_one = compute_safety_score(G_one)["score"]
        score_two = compute_safety_score(G_two)["score"]
        assert score_two >= score_one

    def test_disconnected_graph_lower_score(self):
        G_conn = make_triangle()
        G_disc = nx.Graph()
        G_disc.add_node("A", x=0, y=0, type="exit", capacity=10)
        G_disc.add_node("B", x=100, y=0, type="room", capacity=10)
        # no edges → disconnected
        score_conn = compute_safety_score(G_conn)["score"]
        score_disc = compute_safety_score(G_disc)["score"]
        assert score_conn >= score_disc

    def test_empty_graph_returns_zero(self):
        result = compute_safety_score(nx.Graph())
        assert result["score"] == 0.0
        assert result["grade"] == "F"

    def test_grade_assignment(self):
        result = compute_safety_score(make_building_graph())
        assert result["grade"] in ("A", "B", "C", "D", "F")

    def test_factors_sum_makes_sense(self):
        G = make_building_graph()
        result = compute_safety_score(G)
        f = result["factors"]
        # exit_coverage*40 + min_cut_factor*30 + edge_connectivity_ratio*30 == score
        reconstructed = (
            f["exit_coverage"] * 40 + f["min_cut_factor"] * 30 + f["edge_connectivity_ratio"] * 30
        )
        assert math.isclose(result["score"], round(reconstructed, 1), abs_tol=0.1)


# ---------------------------------------------------------------------------
# Max-flow tests
# ---------------------------------------------------------------------------


class TestComputeMaxflowDistribution:
    def test_basic_flow_reaches_exit(self):
        G = make_building_graph()
        result = compute_maxflow_distribution(G, ["r1", "r2"], ["exit"])
        assert result["total_flow"] > 0
        assert "exit" in result["flow_per_exit"]

    def test_no_occupied_rooms_returns_zero(self):
        G = make_building_graph()
        result = compute_maxflow_distribution(G, [], ["exit"])
        assert result["total_flow"] == 0

    def test_no_exits_returns_zero(self):
        G = make_building_graph()
        result = compute_maxflow_distribution(G, ["r1"], [])
        assert result["total_flow"] == 0

    def test_flow_per_exit_is_non_negative(self):
        G = make_building_graph()
        result = compute_maxflow_distribution(G, ["r1", "r2"], ["exit"])
        for v in result["flow_per_exit"].values():
            assert v >= 0

    def test_bottleneck_edges_structure(self):
        G = make_building_graph()
        result = compute_maxflow_distribution(G, ["r1", "r2"], ["exit"])
        for b in result["bottleneck_edges"]:
            assert "u" in b and "v" in b
            assert "flow" in b and "capacity" in b
            assert 0.0 <= b["utilisation"] <= 1.0


# ---------------------------------------------------------------------------
# Experiment runner tests
# ---------------------------------------------------------------------------


class TestRunExperiments:
    def test_returns_six_rows(self):
        """3 scenarios × 2 algorithms = 6 rows."""
        G = make_building_graph()
        result = run_experiments(G, ["exit"], "r1")
        assert len(result["results"]) == 6

    def test_includes_csv_string(self):
        G = make_building_graph()
        result = run_experiments(G, ["exit"], "r1")
        assert isinstance(result["csv"], str)
        assert "scenario" in result["csv"]
        assert "algorithm" in result["csv"]

    def test_both_algorithms_present(self):
        G = make_building_graph()
        result = run_experiments(G, ["exit"], "r1")
        algos = {r["algorithm"] for r in result["results"]}
        assert "dijkstra" in algos
        assert "astar" in algos

    def test_normal_scenario_finds_route(self):
        G = make_building_graph()
        result = run_experiments(G, ["exit"], "r1")
        normal = [r for r in result["results"] if r["scenario"] == "Normal"]
        assert all(r["avg_time_s"] is not None for r in normal)

    def test_blocked_exit_scenario_present(self):
        G = make_building_graph()
        result = run_experiments(G, ["exit"], "r1")
        names = {r["scenario"] for r in result["results"]}
        assert any("blocked" in n.lower() for n in names)

    def test_invalid_fire_location_raises(self):
        G = make_building_graph()
        with pytest.raises(ValueError):
            run_experiments(G, ["exit"], "NONEXISTENT")

    def test_nodes_visited_non_negative(self):
        G = make_building_graph()
        result = run_experiments(G, ["exit"], "r1")
        for row in result["results"]:
            assert row["nodes_visited"] >= 0

    def test_exec_time_ms_non_negative(self):
        G = make_building_graph()
        result = run_experiments(G, ["exit"], "r1")
        for row in result["results"]:
            assert row["exec_time_ms"] >= 0
