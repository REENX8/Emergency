"""
test_pathfinding.py — Unit tests for Dijkstra, A*, and evacuation helpers
"""

import math

import networkx as nx

from pathfinding import (
    astar,
    compare_algorithms,
    dijkstra,
    estimate_evacuation_time,
    find_all_exit_routes,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_simple_graph() -> nx.Graph:
    """
    Linear graph:  A --(2)--> B --(3)--> C
    Node positions set so the Euclidean heuristic is admissible.
    """
    G = nx.Graph()
    G.add_node("A", x=0, y=0)
    G.add_node("B", x=60, y=0)  # 10 m at 6 px/m
    G.add_node("C", x=120, y=0)  # 20 m at 6 px/m
    G.add_edge("A", "B", weight=2.0)
    G.add_edge("B", "C", weight=3.0)
    return G


def make_forked_graph() -> nx.Graph:
    """
    S → X → exit1 (cost 5)
    S → Y → exit2 (cost 8)
    """
    G = nx.Graph()
    for nid, x, y in [
        ("S", 0, 0),
        ("X", 60, 0),
        ("Y", 0, 60),
        ("exit1", 120, 0),
        ("exit2", 0, 120),
    ]:
        G.add_node(nid, x=x, y=y, type="exit" if nid.startswith("exit") else "room")
    G.add_edge("S", "X", weight=3.0)
    G.add_edge("X", "exit1", weight=2.0)
    G.add_edge("S", "Y", weight=4.0)
    G.add_edge("Y", "exit2", weight=4.0)
    return G


def make_smoke_graph() -> nx.Graph:
    """
    A --(inf, smoke)--> B --(1)--> C
    A --(10)--> C  (alternate route)
    """
    G = nx.Graph()
    for nid, x, y in [("A", 0, 0), ("B", 60, 0), ("C", 120, 0)]:
        G.add_node(nid, x=x, y=y)
    G.add_edge("A", "B", weight=float("inf"), smoke_blocked=True)
    G.add_edge("B", "C", weight=1.0)
    G.add_edge("A", "C", weight=10.0)
    return G


# ---------------------------------------------------------------------------
# Dijkstra tests
# ---------------------------------------------------------------------------


class TestDijkstra:
    def test_simple_path(self):
        G = make_simple_graph()
        path, cost = dijkstra(G, "A", "C")
        assert path == ["A", "B", "C"]
        assert math.isclose(cost, 5.0)

    def test_direct_same_node(self):
        G = make_simple_graph()
        path, cost = dijkstra(G, "A", "A")
        assert path == ["A"]
        assert math.isclose(cost, 0.0)

    def test_unreachable_target(self):
        G = make_simple_graph()
        G.add_node("Z", x=999, y=999)
        path, cost = dijkstra(G, "A", "Z")
        assert path is None
        assert cost == float("inf")

    def test_invalid_source(self):
        G = make_simple_graph()
        path, cost = dijkstra(G, "MISSING", "C")
        assert path is None
        assert cost == float("inf")

    def test_smoke_blocked_uses_alternate(self):
        G = make_smoke_graph()
        path, cost = dijkstra(G, "A", "C")
        assert path == ["A", "C"]
        assert math.isclose(cost, 10.0)

    def test_forked_chooses_cheapest(self):
        G = make_forked_graph()
        path, cost = dijkstra(G, "S", "exit1")
        assert cost < dijkstra(G, "S", "exit2")[1]

    def test_returns_optimal_path(self):
        G = nx.Graph()
        for nid, x, y in [("A", 0, 0), ("B", 60, 0), ("C", 30, 60), ("D", 90, 0)]:
            G.add_node(nid, x=x, y=y)
        G.add_edge("A", "B", weight=1.0)
        G.add_edge("A", "C", weight=5.0)
        G.add_edge("C", "D", weight=1.0)
        G.add_edge("B", "D", weight=1.0)
        path, cost = dijkstra(G, "A", "D")
        assert math.isclose(cost, 2.0)
        assert path == ["A", "B", "D"]


# ---------------------------------------------------------------------------
# A* tests
# ---------------------------------------------------------------------------


class TestAstar:
    def test_simple_path(self):
        G = make_simple_graph()
        path, cost = astar(G, "A", "C")
        assert path == ["A", "B", "C"]
        assert math.isclose(cost, 5.0)

    def test_matches_dijkstra(self):
        G = make_forked_graph()
        for src in ["S"]:
            for tgt in ["exit1", "exit2"]:
                d_path, d_cost = dijkstra(G, src, tgt)
                a_path, a_cost = astar(G, src, tgt)
                assert math.isclose(d_cost, a_cost), (
                    f"{src}→{tgt}: dijkstra={d_cost} astar={a_cost}"
                )

    def test_unreachable_target(self):
        G = make_simple_graph()
        G.add_node("Z", x=999, y=999)
        path, cost = astar(G, "A", "Z")
        assert path is None
        assert cost == float("inf")

    def test_smoke_blocked_uses_alternate(self):
        G = make_smoke_graph()
        path, cost = astar(G, "A", "C")
        assert path == ["A", "C"]
        assert math.isclose(cost, 10.0)


# ---------------------------------------------------------------------------
# find_all_exit_routes tests
# ---------------------------------------------------------------------------


class TestFindAllExitRoutes:
    def test_sorted_by_cost(self):
        G = make_forked_graph()
        exits = ["exit1", "exit2"]
        routes = find_all_exit_routes(G, "S", exits, "dijkstra")
        assert routes[0]["exit"] == "exit1"
        assert routes[0]["cost_seconds"] < routes[1]["cost_seconds"]

    def test_unreachable_exit_at_end(self):
        G = make_forked_graph()
        G.add_node("exit_iso", x=500, y=500, type="exit")
        exits = ["exit1", "exit_iso"]
        routes = find_all_exit_routes(G, "S", exits, "dijkstra")
        reachable = [r for r in routes if r["reachable"]]
        unreachable = [r for r in routes if not r["reachable"]]
        assert len(reachable) >= 1
        assert all(r["exit"] != "exit_iso" for r in reachable)
        assert any(r["exit"] == "exit_iso" for r in unreachable)

    def test_source_skipped_if_exit(self):
        G = make_forked_graph()
        G.nodes["S"]["type"] = "exit"
        routes = find_all_exit_routes(G, "S", ["S", "exit1"], "dijkstra")
        exits_in_result = [r["exit"] for r in routes]
        assert "S" not in exits_in_result

    def test_works_with_astar(self):
        G = make_forked_graph()
        d_routes = find_all_exit_routes(G, "S", ["exit1", "exit2"], "dijkstra")
        a_routes = find_all_exit_routes(G, "S", ["exit1", "exit2"], "astar")
        for dr, ar in zip(d_routes, a_routes, strict=True):
            assert dr["exit"] == ar["exit"]
            assert math.isclose(dr["cost_seconds"], ar["cost_seconds"])


# ---------------------------------------------------------------------------
# compare_algorithms tests
# ---------------------------------------------------------------------------


class TestCompareAlgorithms:
    def test_returns_both_algorithms(self):
        G = make_forked_graph()
        result = compare_algorithms(G, "S", ["exit1", "exit2"])
        assert "dijkstra" in result
        assert "astar" in result

    def test_includes_timing(self):
        G = make_forked_graph()
        result = compare_algorithms(G, "S", ["exit1", "exit2"])
        assert "timing_ms" in result
        assert "dijkstra" in result["timing_ms"]
        assert "astar" in result["timing_ms"]
        assert result["timing_ms"]["dijkstra"] >= 0
        assert result["timing_ms"]["astar"] >= 0


# ---------------------------------------------------------------------------
# estimate_evacuation_time tests
# ---------------------------------------------------------------------------


class TestEstimateEvacuationTime:
    def test_overall_is_max_individual(self):
        G = make_forked_graph()
        exits = ["exit1", "exit2"]
        result = estimate_evacuation_time(G, ["S"], exits, "dijkstra")
        # S → exit1 costs 5s
        assert math.isclose(result["overall_seconds"], 5.0)

    def test_per_room_keys(self):
        G = make_forked_graph()
        result = estimate_evacuation_time(G, ["S"], ["exit1"], "dijkstra")
        assert "S" in result["per_room"]

    def test_algorithm_recorded(self):
        G = make_forked_graph()
        result = estimate_evacuation_time(G, ["S"], ["exit1"], "astar")
        assert result["algorithm"] == "astar"

    def test_empty_occupied_rooms(self):
        G = make_forked_graph()
        result = estimate_evacuation_time(G, [], ["exit1"], "dijkstra")
        assert result["overall_seconds"] == 0.0
        assert result["per_room"] == {}


# ---------------------------------------------------------------------------
# A* admissibility on graphs whose drawing scale is not 6 px/m
# ---------------------------------------------------------------------------


class TestAstarAdmissibility:
    def _scaled_graph(self) -> nx.Graph:
        """Layout drawn at ~120 px/m — the old fixed 6 px/m heuristic
        overestimated remaining cost 20× here, steering A* onto the direct
        (but slower) edge. Optimal: s → a → t (7.1 s) vs direct 14.3 s."""
        G = nx.Graph()
        G.add_node("s", x=0, y=0)
        G.add_node("a", x=600, y=0)
        G.add_node("t", x=1200, y=0)
        G.add_edge("s", "a", distance=5, weight=5 / 1.4)
        G.add_edge("a", "t", distance=5, weight=5 / 1.4)
        G.add_edge("s", "t", distance=20, weight=20 / 1.4)
        return G

    def test_astar_matches_dijkstra_on_non_default_scale(self):
        G = self._scaled_graph()
        d_path, d_cost = dijkstra(G, "s", "t")
        a_path, a_cost = astar(G, "s", "t")
        assert d_path == ["s", "a", "t"]
        assert a_path == d_path
        assert math.isclose(a_cost, d_cost)

    def test_heuristic_degrades_to_dijkstra_without_geometry(self):
        """Zero/absent distances → ratio unknown → h = 0 (still optimal)."""
        G = nx.Graph()
        G.add_node("u", x=0, y=0)
        G.add_node("v", x=50, y=0)
        G.add_edge("u", "v", weight=3.0)  # no distance attribute
        path, cost = astar(G, "u", "v")
        assert path == ["u", "v"]
        assert math.isclose(cost, 3.0)
