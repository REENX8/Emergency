"""Unit tests for the Thai building code compliance rules engine."""

import networkx as nx

from compliance import (
    MAX_DEAD_END_M,
    MAX_TRAVEL_DISTANCE_M_UNSPRINKLERED,
    MIN_STAIR_WIDTH_M,
    BuildingMeta,
    check_corridor_width,
    check_dead_end,
    check_exit_count,
    check_occupancy,
    check_stair_width,
    check_travel_distance,
    evaluate,
)


def _compliant_building() -> nx.Graph:
    """Single-floor 3-node line that passes every rule."""
    G = nx.Graph()
    G.add_node("r1", type="room", floor=1, capacity=20, area_m2=200)
    G.add_node("c1", type="corridor", floor=1)
    G.add_node("exit1", type="exit", floor=1)
    G.add_edge("r1", "c1", distance=8, width=1.8, is_stair=False)
    G.add_edge("c1", "exit1", distance=5, width=1.8, is_stair=False)
    return G


# ---------------------------------------------------------------------------
# stair_width
# ---------------------------------------------------------------------------


def test_stair_width_fails_when_narrow():
    G = _compliant_building()
    G.add_edge("c1", "exit1", distance=5, width=0.9, is_stair=True)
    findings = check_stair_width(G)
    assert any(f.rule_id == "stair_width" for f in findings)
    assert findings[0].severity == "fail"


def test_stair_width_passes_at_threshold():
    G = _compliant_building()
    G.add_edge("c1", "exit1", distance=5, width=MIN_STAIR_WIDTH_M, is_stair=True)
    assert check_stair_width(G) == []


# ---------------------------------------------------------------------------
# corridor_width
# ---------------------------------------------------------------------------


def test_corridor_width_warns_when_narrow():
    G = _compliant_building()
    G["c1"]["exit1"]["width"] = 1.0
    findings = check_corridor_width(G)
    assert any(f.rule_id == "corridor_width" for f in findings)


def test_corridor_width_ignores_internal_room_edges():
    # Edge between two rooms with narrow doorway shouldn't be flagged.
    G = nx.Graph()
    G.add_node("r1", type="room", floor=1)
    G.add_node("r2", type="room", floor=1)
    G.add_edge("r1", "r2", distance=2, width=0.8, is_stair=False)
    assert check_corridor_width(G) == []


# ---------------------------------------------------------------------------
# exit_count
# ---------------------------------------------------------------------------


def test_exit_count_fails_with_no_exits():
    G = nx.Graph()
    G.add_node("r1", type="room", floor=1)
    findings = check_exit_count(G, total_floors=1)
    assert findings and findings[0].rule_id == "exit_count"
    assert "ไม่มี exit" in findings[0].message


def test_exit_count_warns_high_rise_with_one_exit():
    G = nx.Graph()
    G.add_node("exit1", type="exit", floor=1)
    G.add_node("exit2", type="exit", floor=2)  # floor 2 also has only 1
    findings = check_exit_count(G, total_floors=3)
    assert any(f.rule_id == "exit_count" for f in findings)


def test_exit_count_passes_single_floor_single_exit():
    G = _compliant_building()
    assert check_exit_count(G, total_floors=1) == []


# ---------------------------------------------------------------------------
# travel_distance
# ---------------------------------------------------------------------------


def test_travel_distance_fails_when_too_far_no_sprinkler():
    G = nx.Graph()
    G.add_node("r1", type="room")
    G.add_node("c1", type="corridor")
    G.add_node("exit1", type="exit")
    G.add_edge("r1", "c1", distance=50, width=2)
    G.add_edge("c1", "exit1", distance=10, width=2)  # total 60 > 30
    findings = check_travel_distance(G, has_sprinkler=False)
    assert any(f.rule_id == "travel_distance" and "เกิน" in f.message for f in findings)


def test_travel_distance_passes_with_sprinkler_at_50m():
    G = nx.Graph()
    G.add_node("r1", type="room")
    G.add_node("exit1", type="exit")
    G.add_edge("r1", "exit1", distance=50, width=2)
    assert check_travel_distance(G, has_sprinkler=True) == []


def test_travel_distance_fails_when_unreachable():
    G = nx.Graph()
    G.add_node("r1", type="room")
    G.add_node("exit1", type="exit")
    # No edge — disconnected.
    findings = check_travel_distance(G, has_sprinkler=True)
    assert any("ไม่มีทาง" in f.message for f in findings)


# ---------------------------------------------------------------------------
# dead_end
# ---------------------------------------------------------------------------


def test_dead_end_warns_for_long_dead_end_corridor():
    G = _compliant_building()
    G.add_node("c2", type="corridor")
    G.add_edge("c1", "c2", distance=MAX_DEAD_END_M + 5, width=2, is_stair=False)
    findings = check_dead_end(G)
    assert any(f.rule_id == "dead_end" for f in findings)


def test_dead_end_passes_when_short():
    G = _compliant_building()
    G.add_node("c2", type="corridor")
    G.add_edge("c1", "c2", distance=3, width=2)
    assert check_dead_end(G) == []


# ---------------------------------------------------------------------------
# occupancy
# ---------------------------------------------------------------------------


def test_occupancy_warns_when_capacity_exceeds_area():
    G = nx.Graph()
    # office: 9 sqm/person. 18 sqm allows 2 people; cap=20 is overcrowded.
    G.add_node("r1", type="room", capacity=20, area_m2=18)
    findings = check_occupancy(G, building_type="office")
    assert any(f.rule_id == "occupancy" for f in findings)


def test_occupancy_silent_when_area_missing():
    G = nx.Graph()
    G.add_node("r1", type="room", capacity=100)  # no area_m2
    assert check_occupancy(G, building_type="office") == []


# ---------------------------------------------------------------------------
# evaluate (orchestrator)
# ---------------------------------------------------------------------------


def test_evaluate_clean_building_scores_100():
    G = _compliant_building()
    result = evaluate(G, BuildingMeta(has_sprinkler=True, building_type="office", total_floors=1))
    assert result["score"] == 100
    assert result["summary"]["fail"] == 0


def test_evaluate_with_many_failures_lower_score():
    G = _compliant_building()
    G.add_edge("c1", "exit1", distance=5, width=0.5, is_stair=True)  # stair fail
    G.add_node("c99", type="corridor")
    G.add_edge("c1", "c99", distance=20, width=2)  # dead end warn
    result = evaluate(G, BuildingMeta(has_sprinkler=False, building_type="office", total_floors=1))
    assert result["score"] < 100
    assert result["summary"]["fail"] >= 1


def test_evaluate_includes_thresholds_in_response():
    G = _compliant_building()
    result = evaluate(G, BuildingMeta(has_sprinkler=False, total_floors=1))
    assert result["thresholds"]["max_travel_distance_m"] == MAX_TRAVEL_DISTANCE_M_UNSPRINKLERED


def test_exit_count_flags_upper_floor_without_escape_route():
    """A floor with rooms but neither an exit nor a stair must be flagged —
    previously only floors that already had exits were checked at all."""
    G = nx.Graph()
    G.add_node("exit1", type="exit", floor=1)
    G.add_node("exit2", type="exit", floor=1)
    G.add_node("s1", type="stair", floor=1)
    G.add_node("r201", type="room", floor=2)  # trapped: no exit, no stair
    findings = check_exit_count(G, total_floors=2)
    assert any(f.location.get("floor") == 2 for f in findings)


def test_exit_count_counts_stairs_as_escape_routes():
    G = nx.Graph()
    G.add_node("exit1", type="exit", floor=1)
    G.add_node("exit2", type="exit", floor=1)
    G.add_node("s2a", type="stair", floor=2)
    G.add_node("s2b", type="stair", floor=2)
    G.add_node("r201", type="room", floor=2)
    assert check_exit_count(G, total_floors=2) == []
