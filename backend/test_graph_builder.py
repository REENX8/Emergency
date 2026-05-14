"""
test_graph_builder.py — Unit tests for building graph construction
"""

import math
import pytest
import networkx as nx

from graph_builder import (
    build_evacuation_graph,
    calculate_edge_weight,
    get_exits,
    apply_smoke,
    remove_node_safe,
    WALK_SPEED_MS,
    STAIR_SPEED_MS,
    REFERENCE_WIDTH,
    MAX_CROWD_SLOWDOWN,
)


# ---------------------------------------------------------------------------
# calculate_edge_weight tests
# ---------------------------------------------------------------------------

class TestCalculateEdgeWeight:
    def test_empty_corridor_no_crowd(self):
        # weight = (dist/speed) * (ref_width/width) * 1.0
        w = calculate_edge_weight(distance=10.0, width=3.0, crowd_density=0.0)
        expected = (10.0 / WALK_SPEED_MS) * (REFERENCE_WIDTH / 3.0)
        assert math.isclose(w, expected)

    def test_narrow_corridor_higher_weight(self):
        w_wide   = calculate_edge_weight(10.0, 3.0, 0.0)
        w_narrow = calculate_edge_weight(10.0, 1.0, 0.0)
        assert w_narrow > w_wide

    def test_full_crowd_max_slowdown(self):
        w_empty = calculate_edge_weight(10.0, 3.0, 0.0)
        w_full  = calculate_edge_weight(10.0, 3.0, 1.0)
        assert math.isclose(w_full, w_empty * MAX_CROWD_SLOWDOWN)

    def test_stair_uses_slower_speed(self):
        w_flat  = calculate_edge_weight(10.0, 1.5, 0.0, is_stair=False)
        w_stair = calculate_edge_weight(10.0, 1.5, 0.0, is_stair=True)
        assert w_stair > w_flat

    def test_minimum_width_clamp(self):
        # width=0 would cause division by zero; should clamp to 0.5
        w = calculate_edge_weight(10.0, 0.0, 0.0)
        expected = (10.0 / WALK_SPEED_MS) * (REFERENCE_WIDTH / 0.5)
        assert math.isclose(w, expected)

    def test_partial_crowd(self):
        w_empty   = calculate_edge_weight(10.0, 3.0, 0.0)
        w_half    = calculate_edge_weight(10.0, 3.0, 0.5)
        w_full    = calculate_edge_weight(10.0, 3.0, 1.0)
        assert w_empty < w_half < w_full


# ---------------------------------------------------------------------------
# build_evacuation_graph tests
# ---------------------------------------------------------------------------

class TestBuildEvacuationGraph:
    def test_node_count(self):
        G = build_evacuation_graph()
        assert G.number_of_nodes() == 21

    def test_edge_count(self):
        G = build_evacuation_graph()
        assert G.number_of_edges() == 22

    def test_all_nodes_have_position(self):
        G = build_evacuation_graph()
        for nid, data in G.nodes(data=True):
            assert "x" in data, f"Node {nid} missing x"
            assert "y" in data, f"Node {nid} missing y"

    def test_all_edges_have_weight(self):
        G = build_evacuation_graph()
        for u, v, data in G.edges(data=True):
            assert "weight" in data
            assert data["weight"] > 0

    def test_three_exits(self):
        G = build_evacuation_graph()
        exits = get_exits(G)
        assert len(exits) == 3
        assert set(exits) == {"exit1", "exit2", "exit3"}

    def test_crowd_density_increases_weight(self):
        G_base  = build_evacuation_graph()
        G_crowd = build_evacuation_graph(crowd_densities={"c1": 1.0})
        # All edges adjacent to c1 should be heavier
        for v in G_base.neighbors("c1"):
            assert G_crowd["c1"][v]["weight"] >= G_base["c1"][v]["weight"]

    def test_crowd_density_zero_equals_base(self):
        G_base  = build_evacuation_graph()
        G_zero  = build_evacuation_graph(crowd_densities={"c1": 0.0})
        for v in G_base.neighbors("c1"):
            assert math.isclose(G_base["c1"][v]["weight"], G_zero["c1"][v]["weight"])

    def test_stair_edges_flagged(self):
        G = build_evacuation_graph()
        stair_edges = [(u,v) for u,v,d in G.edges(data=True) if d.get("is_stair")]
        assert len(stair_edges) == 4   # A:F1-F2, A:F2-F3, B:F1-F2, B:F2-F3

    def test_base_time_stored(self):
        G = build_evacuation_graph(crowd_densities={"c1": 0.8})
        for u, v, data in G.edges(data=True):
            assert "base_time" in data
            # base_time is weight at zero density; should be ≤ weight with crowd
            assert data["base_time"] <= data["weight"] + 1e-9


# ---------------------------------------------------------------------------
# get_exits tests
# ---------------------------------------------------------------------------

class TestGetExits:
    def test_returns_only_exits(self):
        G = build_evacuation_graph()
        exits = get_exits(G)
        for e in exits:
            assert G.nodes[e]["type"] == "exit"

    def test_empty_graph(self):
        assert get_exits(nx.Graph()) == []


# ---------------------------------------------------------------------------
# apply_smoke tests
# ---------------------------------------------------------------------------

class TestApplySmoke:
    def test_blocks_edges(self):
        G = build_evacuation_graph()
        apply_smoke(G, [("r101", "c1")])
        assert G["r101"]["c1"]["weight"] == float("inf")
        assert G["r101"]["c1"]["smoke_blocked"] is True

    def test_ignores_nonexistent_edges(self):
        G = build_evacuation_graph()
        apply_smoke(G, [("r101", "exit1")])   # no direct edge
        # Should not raise; no change
        assert G.number_of_edges() == 22

    def test_other_edges_unaffected(self):
        G = build_evacuation_graph()
        original_weight = G["r102"]["c1"]["weight"]
        apply_smoke(G, [("r101", "c1")])
        assert math.isclose(G["r102"]["c1"]["weight"], original_weight)

    def test_multiple_edges(self):
        G = build_evacuation_graph()
        apply_smoke(G, [("r101","c1"), ("r102","c1"), ("r103","c1")])
        for u in ["r101","r102","r103"]:
            assert G[u]["c1"]["weight"] == float("inf")


# ---------------------------------------------------------------------------
# remove_node_safe tests
# ---------------------------------------------------------------------------

class TestRemoveNodeSafe:
    def test_removes_existing_node(self):
        G = build_evacuation_graph()
        result = remove_node_safe(G, "exit1")
        assert result is True
        assert "exit1" not in G

    def test_returns_false_for_missing_node(self):
        G = build_evacuation_graph()
        result = remove_node_safe(G, "nonexistent")
        assert result is False

    def test_also_removes_adjacent_edges(self):
        G = build_evacuation_graph()
        edges_before = G.number_of_edges()
        remove_node_safe(G, "exit1")
        assert G.number_of_edges() < edges_before
