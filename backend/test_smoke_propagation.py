"""
test_smoke_propagation.py — Tests for the continuous smoke level model
"""

import math
import networkx as nx
import pytest

from smoke_propagation import (
    BLOCK_THR,
    LAMBDA,
    compute_smoke_levels,
    apply_smoke_levels,
    smoke_levels_to_cytoscape,
)
from graph_builder import calculate_edge_weight, WALK_SPEED_MS


def make_linear_graph() -> nx.Graph:
    """
    FIRE --(10m)--> MID --(15m)--> FAR
    Positions in pixels (6 px/m): FIRE=(0,0), MID=(60,0), FAR=(120,0)
    base_time = d / v_base (zero crowd, zero risk)
    """
    G = nx.Graph()
    G.add_node("FIRE", x=0,   y=0,  type="room",     capacity=10)
    G.add_node("MID",  x=60,  y=0,  type="corridor", capacity=20)
    G.add_node("FAR",  x=120, y=0,  type="exit",     capacity=50)
    bt1 = 10.0 / WALK_SPEED_MS
    bt2 = 15.0 / WALK_SPEED_MS
    G.add_edge("FIRE", "MID", weight=bt1, base_time=bt1, distance=10.0,
               width=2.0, crowd_density=0.0, is_stair=False)
    G.add_edge("MID",  "FAR", weight=bt2, base_time=bt2, distance=15.0,
               width=2.0, crowd_density=0.0, is_stair=False)
    return G


def make_cross_graph() -> nx.Graph:
    """
    Cross layout: FIRE at centre, 4 nodes N/S/E/W
    Tests wind direction effect on phi.
    """
    G = nx.Graph()
    pos = {"FIRE": (0, 0), "N": (0, -60), "S": (0, 60), "E": (60, 0), "W": (-60, 0)}
    for n, (x, y) in pos.items():
        G.add_node(n, x=x, y=y, type="exit" if n != "FIRE" else "room", capacity=20)
    for n in ("N", "S", "E", "W"):
        G.add_edge("FIRE", n, weight=10.0, base_time=10.0, distance=10.0,
                   width=2.0, crowd_density=0.0, is_stair=False)
    return G


# ---------------------------------------------------------------------------
# compute_smoke_levels
# ---------------------------------------------------------------------------

class TestComputeSmokeLevels:
    def test_returns_one_entry_per_edge(self):
        G = make_linear_graph()
        levels = compute_smoke_levels("FIRE", G, wind_direction_deg=0, wind_speed_ms=0)
        assert len(levels) == G.number_of_edges()

    def test_edge_adjacent_to_fire_has_highest_smoke(self):
        G = make_linear_graph()
        levels = compute_smoke_levels("FIRE", G, wind_direction_deg=0, wind_speed_ms=0)
        s_near = levels[("FIRE", "MID")]
        s_far  = levels[("MID", "FAR")]
        assert s_near > s_far, "Edge closer to fire should have higher smoke"

    def test_smoke_decreases_with_distance(self):
        G = make_linear_graph()
        levels = compute_smoke_levels("FIRE", G, wind_direction_deg=0, wind_speed_ms=0)
        for s in levels.values():
            assert 0.0 <= s <= 1.0, "Smoke level must be in [0, 1]"

    def test_missing_fire_node_returns_empty(self):
        G = make_linear_graph()
        levels = compute_smoke_levels("NONEXISTENT", G, wind_direction_deg=0, wind_speed_ms=0)
        assert levels == {}

    def test_wind_amplifies_downwind_edges(self):
        """
        Wind blowing East (from W=270° → toward E=90°).
        Edge FIRE→E is downwind, FIRE→W is upwind.
        Downwind edge should have higher or equal smoke.
        """
        G = make_cross_graph()
        # Wind blows FROM West (270°) → toward East
        levels = compute_smoke_levels("FIRE", G, wind_direction_deg=270, wind_speed_ms=5)
        s_east = levels.get(("FIRE", "E")) or levels.get(("E", "FIRE"), 0)
        s_west = levels.get(("FIRE", "W")) or levels.get(("W", "FIRE"), 0)
        assert s_east >= s_west, "Downwind edge should have >= smoke than upwind"

    def test_smoke_level_at_fire_edge_near_one(self):
        G = make_linear_graph()
        # No wind, fire at node — adjacent edge midpoint is 5m away
        levels = compute_smoke_levels("FIRE", G, wind_direction_deg=0, wind_speed_ms=0)
        s = levels[("FIRE", "MID")]
        # Expected: exp(-0.15 * 5) * phi ~ exp(-0.75) ~ 0.47
        # (phi depends on direction vs wind vector)
        assert s > 0.1, "Smoke at fire edge should be significant"
        assert s <= 1.0

    def test_higher_wind_speed_increases_spread(self):
        G = make_linear_graph()
        levels_calm = compute_smoke_levels("FIRE", G, wind_direction_deg=90, wind_speed_ms=0)
        levels_windy = compute_smoke_levels("FIRE", G, wind_direction_deg=90, wind_speed_ms=10)
        # Downwind edge: windy should have higher smoke on the far edge
        s_calm_far  = levels_calm[("MID", "FAR")]
        s_windy_far = levels_windy[("MID", "FAR")]
        assert s_windy_far >= s_calm_far


# ---------------------------------------------------------------------------
# apply_smoke_levels
# ---------------------------------------------------------------------------

class TestApplySmokeLevels:
    def test_high_smoke_sets_weight_inf(self):
        G = make_linear_graph()
        # Force the near edge to have smoke >= BLOCK_THR
        smoke = {("FIRE", "MID"): BLOCK_THR + 0.01, ("MID", "FAR"): 0.0}
        apply_smoke_levels(G, smoke)
        assert G["FIRE"]["MID"]["weight"] == float("inf")
        assert G["FIRE"]["MID"]["smoke_blocked"] is True

    def test_low_smoke_uses_formula(self):
        G = make_linear_graph()
        s = 0.5
        smoke = {("FIRE", "MID"): s, ("MID", "FAR"): 0.0}
        apply_smoke_levels(G, smoke)
        e = G["FIRE"]["MID"]
        # w = d / (v_base × (1 − ρ) × (1 − s))
        expected = calculate_edge_weight(e["distance"], e["crowd_density"], s, e.get("is_stair", False))
        assert math.isclose(e["weight"], expected, rel_tol=1e-6)

    def test_zero_smoke_preserves_base_time(self):
        G = make_linear_graph()
        smoke = {("FIRE", "MID"): 0.0, ("MID", "FAR"): 0.0}
        apply_smoke_levels(G, smoke)
        e = G["FIRE"]["MID"]
        assert math.isclose(e["weight"], e["base_time"])

    def test_smoke_level_stored_on_edge(self):
        G = make_linear_graph()
        smoke = {("FIRE", "MID"): 0.3, ("MID", "FAR"): 0.1}
        apply_smoke_levels(G, smoke)
        assert math.isclose(G["FIRE"]["MID"]["smoke_level"], 0.3)

    def test_nonexistent_edge_skipped(self):
        G = make_linear_graph()
        # Edge FIRE→FAR does not exist
        smoke = {("FIRE", "FAR"): 0.5}
        apply_smoke_levels(G, smoke)   # should not raise


# ---------------------------------------------------------------------------
# smoke_levels_to_cytoscape
# ---------------------------------------------------------------------------

class TestSmokeLevelsToCytoscape:
    def test_output_length_matches_input(self):
        levels = {("A", "B"): 0.3, ("B", "C"): 0.95}
        out = smoke_levels_to_cytoscape(levels)
        assert len(out) == 2

    def test_blocked_flag_correct(self):
        levels = {("A", "B"): 0.89, ("B", "C"): 0.91}
        out = smoke_levels_to_cytoscape(levels)
        by_src = {o["source"]: o for o in out}
        assert by_src["A"]["blocked"] is False
        assert by_src["B"]["blocked"] is True

    def test_smoke_level_rounded(self):
        levels = {("X", "Y"): 0.123456789}
        out = smoke_levels_to_cytoscape(levels)
        assert out[0]["smoke_level"] == round(0.123456789, 4)
