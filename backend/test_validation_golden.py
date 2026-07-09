"""Golden test cases — verify simulator output against hand-computed values.

If a refactor changes the formula or weighting, these tests intentionally
fail loud so the change is acknowledged. Update the golden JSON only after
manually re-validating the expected numbers.
"""

import json
import os

import networkx as nx
import pytest

from graph_builder import calculate_edge_weight
from pathfinding import estimate_evacuation_time

GOLDEN_DIR = os.path.join(os.path.dirname(__file__), "validation")


def _load(name: str) -> dict:
    with open(os.path.join(GOLDEN_DIR, name), encoding="utf-8") as fp:
        return json.load(fp)


def _graph_from_json(spec: dict) -> nx.Graph:
    G = nx.Graph()
    for n in spec["nodes"]:
        G.add_node(
            n["node_key"],
            type=n["type"],
            x=n["x"],
            y=n["y"],
            floor=n["floor_number"],
            capacity=n.get("capacity", 0),
        )
    for e in spec["edges"]:
        weight = calculate_edge_weight(e["distance_m"], 0.0, 0.0, e.get("is_stair", False))
        base = weight
        G.add_edge(
            e["u_key"],
            e["v_key"],
            distance=e["distance_m"],
            width=e["width_m"],
            is_stair=e.get("is_stair", False),
            crowd_density=0.0,
            smoke_level=0.0,
            base_time=base,
            weight=weight,
        )
    return G


@pytest.mark.parametrize("filename", ["golden_small_office.json"])
def test_golden_case_matches_expected(filename):
    spec = _load(filename)
    G = _graph_from_json(spec)
    exits = [n["node_key"] for n in spec["nodes"] if n["type"] == "exit"]
    rooms = list(spec["expected"]["evacuation_times_s"].keys())
    tolerance = float(spec["expected"]["tolerance_s"])

    result = estimate_evacuation_time(G, rooms, exits, "dijkstra")
    per_room = result["per_room"]

    for room, expected in spec["expected"]["evacuation_times_s"].items():
        actual = per_room[room]["cost_seconds"]
        assert abs(actual - expected) <= tolerance, (
            f"{filename} room={room}: expected {expected}s ±{tolerance}, got {actual}s"
        )
