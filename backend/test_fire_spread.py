"""
test_fire_spread.py — Tests for the physics-based fire spread model.
"""

import math

import networkx as nx

from fire_spread import (
    V_BASE,
    compute_fire_spread,
    fire_nodes_at_time,
    fire_spread_to_cytoscape,
)

# ---------------------------------------------------------------------------
# Helper graph factories
# ---------------------------------------------------------------------------


def make_chain_graph() -> nx.Graph:
    """
    Linear chain: A --10m-- B --10m-- C
    Positions:   A=(0,0), B=(60,0), C=(120,0)  [6 px/m]
    All rooms, width=2m
    """
    G = nx.Graph()
    G.add_node("A", type="room", x=0, y=0, capacity=10)
    G.add_node("B", type="room", x=60, y=0, capacity=10)
    G.add_node("C", type="room", x=120, y=0, capacity=10)
    G.add_edge("A", "B", weight=10.0, distance=10.0, width=2.0, is_stair=False)
    G.add_edge("B", "C", weight=10.0, distance=10.0, width=2.0, is_stair=False)
    return G


def make_type_graph() -> nx.Graph:
    """
    Fire at FIRE → three destinations via same distance/width edges.
    ROOM: type=room, STAIR: type=stair, CORR: type=corridor, EXIT_N: type=exit
    """
    G = nx.Graph()
    G.add_node("FIRE", type="room", x=0, y=0, capacity=10)
    G.add_node("ROOM", type="room", x=60, y=0, capacity=10)
    G.add_node("STAIR", type="stair", x=0, y=60, capacity=10)
    G.add_node("CORR", type="corridor", x=-60, y=0, capacity=10)
    G.add_node("EXIT_N", type="exit", x=0, y=-60, capacity=50)

    for dest in ("ROOM", "STAIR", "CORR", "EXIT_N"):
        G.add_edge("FIRE", dest, weight=5.0, distance=10.0, width=2.0, is_stair=False)
    return G


def make_width_graph() -> nx.Graph:
    """
    FIRE → NARROW (width=0.5m) and FIRE → WIDE (width=2.0m), same distance.
    """
    G = nx.Graph()
    G.add_node("FIRE", type="room", x=0, y=0, capacity=10)
    G.add_node("NARROW", type="room", x=60, y=0, capacity=10)
    G.add_node("WIDE", type="room", x=-60, y=0, capacity=10)

    G.add_edge("FIRE", "NARROW", weight=5.0, distance=10.0, width=0.5, is_stair=False)
    G.add_edge("FIRE", "WIDE", weight=5.0, distance=10.0, width=2.0, is_stair=False)
    return G


def make_wind_graph() -> nx.Graph:
    """
    FIRE at centre, EAST to the east, WEST to the west.
    Wind blows from West (270°) toward East.
    """
    G = nx.Graph()
    G.add_node("FIRE", type="room", x=0, y=0, capacity=10)
    G.add_node("EAST", type="room", x=60, y=0, capacity=10)
    G.add_node("WEST", type="room", x=-60, y=0, capacity=10)

    G.add_edge("FIRE", "EAST", weight=5.0, distance=10.0, width=2.0, is_stair=False)
    G.add_edge("FIRE", "WEST", weight=5.0, distance=10.0, width=2.0, is_stair=False)
    return G


def make_disconnected_graph() -> nx.Graph:
    """
    Two separate components: {FIRE, A, B} and {ISOLATED}
    """
    G = nx.Graph()
    G.add_node("FIRE", type="room", x=0, y=0, capacity=10)
    G.add_node("A", type="room", x=60, y=0, capacity=10)
    G.add_node("B", type="room", x=120, y=0, capacity=10)
    G.add_node("ISOLATED", type="room", x=500, y=0, capacity=10)

    G.add_edge("FIRE", "A", weight=5.0, distance=10.0, width=2.0, is_stair=False)
    G.add_edge("A", "B", weight=5.0, distance=10.0, width=2.0, is_stair=False)
    # ISOLATED has no edges
    return G


def make_smoke_blocked_graph() -> nx.Graph:
    """
    FIRE → BLOCKED (smoke-blocked, weight=inf) and FIRE → OPEN
    """
    G = nx.Graph()
    G.add_node("FIRE", type="room", x=0, y=0, capacity=10)
    G.add_node("BLOCKED", type="room", x=60, y=0, capacity=10)
    G.add_node("OPEN", type="room", x=-60, y=0, capacity=10)

    G.add_edge("FIRE", "BLOCKED", weight=float("inf"), distance=10.0, width=2.0, is_stair=False)
    G.add_edge("FIRE", "OPEN", weight=5.0, distance=10.0, width=2.0, is_stair=False)
    return G


# ---------------------------------------------------------------------------
# Tests: compute_fire_spread
# ---------------------------------------------------------------------------


class TestComputeFireSpread:
    def test_source_has_reach_time_zero(self):
        """Fire starts at source node — reach_time[source] == 0."""
        G = make_chain_graph()
        result = compute_fire_spread("A", G)
        assert result["reach_time"]["A"] == 0.0

    def test_chain_spread_order(self):
        """Linear chain A→B→C: fire spreads in order A, B, C."""
        G = make_chain_graph()
        result = compute_fire_spread("A", G)
        rt = result["reach_time"]
        assert rt["A"] < rt["B"] < rt["C"]

    def test_chain_spread_order_list(self):
        """spread_order is sorted by reach time."""
        G = make_chain_graph()
        result = compute_fire_spread("A", G)
        order = result["spread_order"]
        assert order[0] == "A"
        assert order[1] == "B"
        assert order[2] == "C"

    def test_stair_reached_faster_than_room(self):
        """Stair type_mult=2.5 vs room=1.0: stair reached in less time."""
        G = make_type_graph()
        result = compute_fire_spread("FIRE", G)
        rt = result["reach_time"]
        assert rt["STAIR"] < rt["ROOM"], (
            f"Stair ({rt['STAIR']:.2f}s) should be reached before room ({rt['ROOM']:.2f}s)"
        )

    def test_corridor_reached_faster_than_room(self):
        """Corridor type_mult=1.5 > room=1.0: corridor reached faster."""
        G = make_type_graph()
        result = compute_fire_spread("FIRE", G)
        rt = result["reach_time"]
        assert rt["CORR"] < rt["ROOM"], (
            f"Corridor ({rt['CORR']:.2f}s) should be reached before room ({rt['ROOM']:.2f}s)"
        )

    def test_exit_reached_slower_than_room(self):
        """Exit type_mult=0.5 < room=1.0: exit reached slower."""
        G = make_type_graph()
        result = compute_fire_spread("FIRE", G)
        rt = result["reach_time"]
        assert rt["EXIT_N"] > rt["ROOM"], (
            f"Exit ({rt['EXIT_N']:.2f}s) should be reached after room ({rt['ROOM']:.2f}s)"
        )

    def test_narrow_edge_slower_than_wide_edge(self):
        """width=0.5m (factor=0.25) → slower spread than width=2.0m (factor=1.0)."""
        G = make_width_graph()
        result = compute_fire_spread("FIRE", G)
        rt = result["reach_time"]
        assert rt["NARROW"] > rt["WIDE"], (
            f"Narrow ({rt['NARROW']:.2f}s) should be slower than wide ({rt['WIDE']:.2f}s)"
        )

    def test_wind_in_same_direction_speeds_up_spread(self):
        """Wind from West (270°) toward East: EAST node reached faster with wind."""
        G = make_wind_graph()
        no_wind = compute_fire_spread("FIRE", G, wind_direction_deg=270, wind_speed_ms=0.0)
        with_wind = compute_fire_spread("FIRE", G, wind_direction_deg=270, wind_speed_ms=5.0)
        rt_no = no_wind["reach_time"]["EAST"]
        rt_wind = with_wind["reach_time"]["EAST"]
        assert rt_wind < rt_no, (
            f"Wind should speed up eastward spread: {rt_wind:.2f}s < {rt_no:.2f}s"
        )

    def test_wind_against_direction_not_slower_than_no_wind(self):
        """
        max(0, cos_angle) ensures headwind does not slow spread below no-wind.
        When wind blows toward East but we check WEST node, cos_angle is negative
        → clamped to 0 → wind_factor stays 1.0 → same as no-wind.
        """
        G = make_wind_graph()
        no_wind = compute_fire_spread("FIRE", G, wind_direction_deg=270, wind_speed_ms=5.0)
        rt_west_with_wind = no_wind["reach_time"]["WEST"]

        # No-wind baseline
        baseline = compute_fire_spread("FIRE", G, wind_direction_deg=270, wind_speed_ms=0.0)
        rt_west_no_wind = baseline["reach_time"]["WEST"]

        # Headwind should not increase travel time vs no-wind
        assert rt_west_with_wind <= rt_west_no_wind + 1e-9, (
            f"Headwind should not slow: {rt_west_with_wind:.2f}s vs {rt_west_no_wind:.2f}s"
        )

    def test_unreachable_disconnected_node(self):
        """ISOLATED node in disconnected component should be in unreachable list."""
        G = make_disconnected_graph()
        result = compute_fire_spread("FIRE", G)
        assert "ISOLATED" in result["unreachable"]
        assert "ISOLATED" not in result["reach_time"]

    def test_smoke_blocked_edges_skipped(self):
        """Smoke-blocked edges (weight==inf) are skipped; BLOCKED not reachable."""
        G = make_smoke_blocked_graph()
        result = compute_fire_spread("FIRE", G)
        # BLOCKED is only reachable via the inf-weight edge → unreachable
        assert "BLOCKED" in result["unreachable"]
        # OPEN is reachable
        assert "OPEN" in result["reach_time"]

    def test_invalid_fire_node_returns_empty(self):
        """Non-existent fire_node returns empty reach_time and all nodes unreachable."""
        G = make_chain_graph()
        result = compute_fire_spread("NONEXISTENT", G)
        assert result["reach_time"] == {}
        assert result["spread_order"] == []
        assert set(result["unreachable"]) == set(G.nodes())

    def test_reach_time_monotone_with_dijkstra(self):
        """No node can have a lower reach_time than its predecessors in spread_order."""
        G = make_chain_graph()
        result = compute_fire_spread("A", G)
        times = [result["reach_time"][n] for n in result["spread_order"]]
        for i in range(1, len(times)):
            assert times[i] >= times[i - 1]

    def test_type_spread_times_match_formula(self):
        """
        Manually verify spread time for room vs stair with known formula values.
        distance=10m, width=2m → width_factor=min(1.0, 2.0/2.0)=1.0
        No wind → wind_factor=1.0
        v_fire_room  = 0.02 * 1.0 * 1.0 * 1.0 = 0.02 m/s → t = 10/0.02 = 500s
        v_fire_stair = 0.02 * 2.5 * 1.0 * 1.0 = 0.05 m/s → t = 10/0.05 = 200s
        """
        G = make_type_graph()
        result = compute_fire_spread("FIRE", G, wind_direction_deg=0, wind_speed_ms=0)
        rt = result["reach_time"]

        expected_room = 10.0 / (V_BASE * 1.0 * 1.0 * 1.0)  # 500s
        expected_stair = 10.0 / (V_BASE * 2.5 * 1.0 * 1.0)  # 200s

        assert math.isclose(rt["ROOM"], expected_room, rel_tol=1e-6)
        assert math.isclose(rt["STAIR"], expected_stair, rel_tol=1e-6)


# ---------------------------------------------------------------------------
# Tests: fire_nodes_at_time
# ---------------------------------------------------------------------------


class TestFireNodesAtTime:
    def test_returns_source_at_time_zero(self):
        reach_time = {"A": 0.0, "B": 100.0, "C": 200.0}
        nodes = fire_nodes_at_time(reach_time, 0.0)
        assert nodes == ["A"]

    def test_returns_correct_set_at_midpoint(self):
        reach_time = {"A": 0.0, "B": 100.0, "C": 200.0}
        nodes = fire_nodes_at_time(reach_time, 100.0)
        assert set(nodes) == {"A", "B"}

    def test_returns_all_nodes_at_max_time(self):
        reach_time = {"A": 0.0, "B": 100.0, "C": 200.0}
        nodes = fire_nodes_at_time(reach_time, 300.0)
        assert set(nodes) == {"A", "B", "C"}

    def test_returns_empty_before_any_spread(self):
        # Only source at t=0
        reach_time = {"A": 0.0, "B": 50.0}
        nodes = fire_nodes_at_time(reach_time, -1.0)
        assert nodes == []

    def test_boundary_inclusive(self):
        reach_time = {"A": 0.0, "B": 50.0, "C": 100.0}
        nodes = fire_nodes_at_time(reach_time, 50.0)
        assert "B" in nodes
        assert "C" not in nodes


# ---------------------------------------------------------------------------
# Tests: fire_spread_to_cytoscape
# ---------------------------------------------------------------------------


class TestFireSpreadToCytoscape:
    def test_returns_sorted_list(self):
        """Output is sorted ascending by reach_time."""
        reach_time = {"C": 200.0, "A": 0.0, "B": 100.0}
        out = fire_spread_to_cytoscape(reach_time)
        times = [item["reach_time"] for item in out]
        assert times == sorted(times)

    def test_output_length_matches_input(self):
        reach_time = {"A": 0.0, "B": 50.0, "C": 100.0}
        out = fire_spread_to_cytoscape(reach_time)
        assert len(out) == 3

    def test_output_contains_node_and_reach_time_keys(self):
        reach_time = {"A": 0.0}
        out = fire_spread_to_cytoscape(reach_time)
        assert "node" in out[0]
        assert "reach_time" in out[0]

    def test_first_item_is_fire_source(self):
        """The first item in sorted output should be the fire node (reach_time=0)."""
        reach_time = {"source": 0.0, "far": 500.0, "mid": 250.0}
        out = fire_spread_to_cytoscape(reach_time)
        assert out[0]["node"] == "source"
        assert out[0]["reach_time"] == 0.0

    def test_reach_time_rounded(self):
        reach_time = {"A": 0.123456789}
        out = fire_spread_to_cytoscape(reach_time)
        assert out[0]["reach_time"] == round(0.123456789, 2)

    def test_empty_input_returns_empty_list(self):
        out = fire_spread_to_cytoscape({})
        assert out == []
