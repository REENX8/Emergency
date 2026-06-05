"""
graph_builder.py — Building graph construction using NetworkX

Graph Theory Model:
  - Nodes: physical spaces (rooms, corridors, stairs, exits)
  - Edges: passable connections between adjacent spaces
  - Edge weight: w(e) = d / (v_base × (1 − ρ(e)) × (1 − R(e)))

If R(e) ≥ 0.9 the edge is impassable (weight = ∞).
ρ(e) = crowd density [0, 1), R(e) = smoke/risk level [0, 1].
"""

import networkx as nx
from typing import Dict, Tuple


WALK_SPEED_MS  = 1.4   # m/s (normal walking)
STAIR_SPEED_MS = 0.6   # m/s (descending stairs under stress)


def calculate_edge_weight(
    distance: float,
    crowd_density: float,
    risk: float = 0.0,
    is_stair: bool = False,
) -> float:
    """
    Compute edge traversal cost in seconds.

    Formula: w(e) = d / (v_base × (1 − ρ) × (1 − R))
    If R ≥ 0.9 or denominator ≤ 0 → weight = infinity (impassable).

    Args:
        distance:      length of segment in metres
        crowd_density: occupancy ratio 0.0 (empty) … <1.0 (jammed)
        risk:          smoke/risk level 0.0 … 1.0
        is_stair:      True for vertical stairwell segments
    Returns:
        Traversal time in seconds (used as graph edge weight)
    """
    if risk >= 0.9:
        return float("inf")
    speed = STAIR_SPEED_MS if is_stair else WALK_SPEED_MS
    denominator = speed * (1.0 - crowd_density) * (1.0 - risk)
    if denominator <= 0:
        return float("inf")
    return distance / denominator


def build_evacuation_graph(crowd_densities: Dict[str, float] | None = None) -> nx.Graph:
    """
    Build a 3-floor office building as a weighted undirected graph (21 nodes).

    Layout (top-down view per floor):
      Stair-A  ←——  Corridor  ——→  Stair-B
                  |        |
               rooms   (west-exit on F1)

    Floor layout repeated on F1/F2/F3; staircases connect vertically.
    Two ground exits (exit1, exit2) reachable from Stair-A and Stair-B.
    One west exit (exit3) reachable directly from F1 corridor.

    Args:
        crowd_densities: dict mapping node_id → occupancy ratio [0,1].
                         Affects weights of edges adjacent to that node.
    Returns:
        NetworkX Graph with 'weight', 'distance', 'width', 'base_time' on edges
        and type/floor/x/y/label on nodes.
    """
    if crowd_densities is None:
        crowd_densities = {}

    G = nx.Graph()

    # ------------------------------------------------------------------
    # NODES  (id, attributes)
    # x/y are pixel positions used by Cytoscape.js (0,0 = top-left)
    # ------------------------------------------------------------------
    nodes = [
        # ── Floor 1 ────────────────────────────────────────────────────
        ("r101",      {"type": "room",     "floor": 1, "x": 120, "y": 380, "label": "Room 101",    "capacity": 30}),
        ("r102",      {"type": "room",     "floor": 1, "x": 240, "y": 380, "label": "Room 102",    "capacity": 25}),
        ("r103",      {"type": "room",     "floor": 1, "x": 360, "y": 380, "label": "Room 103",    "capacity": 20}),
        ("c1",        {"type": "corridor", "floor": 1, "x": 240, "y": 280, "label": "Corridor 1F", "capacity": 60}),
        ("stair_a_f1",{"type": "stair",    "floor": 1, "x": 80,  "y": 280, "label": "Stair A·1F", "capacity": 20}),
        ("stair_b_f1",{"type": "stair",    "floor": 1, "x": 400, "y": 280, "label": "Stair B·1F", "capacity": 20}),
        ("exit1",     {"type": "exit",     "floor": 1, "x": 80,  "y": 160, "label": "Main Exit",   "capacity": 120}),
        ("exit2",     {"type": "exit",     "floor": 1, "x": 400, "y": 160, "label": "South Exit",  "capacity": 80}),
        ("exit3",     {"type": "exit",     "floor": 1, "x": 240, "y": 160, "label": "West Exit",   "capacity": 60}),

        # ── Floor 2 ────────────────────────────────────────────────────
        ("r201",      {"type": "room",     "floor": 2, "x": 120, "y": 680, "label": "Room 201",    "capacity": 30}),
        ("r202",      {"type": "room",     "floor": 2, "x": 240, "y": 680, "label": "Room 202",    "capacity": 25}),
        ("r203",      {"type": "room",     "floor": 2, "x": 360, "y": 680, "label": "Room 203",    "capacity": 20}),
        ("c2",        {"type": "corridor", "floor": 2, "x": 240, "y": 580, "label": "Corridor 2F", "capacity": 60}),
        ("stair_a_f2",{"type": "stair",    "floor": 2, "x": 80,  "y": 580, "label": "Stair A·2F", "capacity": 20}),
        ("stair_b_f2",{"type": "stair",    "floor": 2, "x": 400, "y": 580, "label": "Stair B·2F", "capacity": 20}),

        # ── Floor 3 ────────────────────────────────────────────────────
        ("r301",      {"type": "room",     "floor": 3, "x": 120, "y": 980, "label": "Room 301",    "capacity": 30}),
        ("r302",      {"type": "room",     "floor": 3, "x": 240, "y": 980, "label": "Room 302",    "capacity": 25}),
        ("r303",      {"type": "room",     "floor": 3, "x": 360, "y": 980, "label": "Room 303",    "capacity": 20}),
        ("c3",        {"type": "corridor", "floor": 3, "x": 240, "y": 880, "label": "Corridor 3F", "capacity": 60}),
        ("stair_a_f3",{"type": "stair",    "floor": 3, "x": 80,  "y": 880, "label": "Stair A·3F", "capacity": 20}),
        ("stair_b_f3",{"type": "stair",    "floor": 3, "x": 400, "y": 880, "label": "Stair B·3F", "capacity": 20}),
    ]
    G.add_nodes_from(nodes)

    # ------------------------------------------------------------------
    # EDGES  (u, v, distance_m, width_m, is_stair)
    # ------------------------------------------------------------------
    edge_defs: list[Tuple] = [
        # Floor 1 – horizontal
        ("r101",       "c1",          15.0, 2.0, False),
        ("r102",       "c1",          10.0, 2.0, False),
        ("r103",       "c1",          15.0, 2.0, False),
        ("c1",         "stair_a_f1",  20.0, 2.5, False),
        ("c1",         "stair_b_f1",  20.0, 2.5, False),
        ("c1",         "exit3",       15.0, 2.0, False),   # direct west exit
        # Floor 1 – exits
        ("stair_a_f1", "exit1",        5.0, 3.5, False),
        ("stair_b_f1", "exit2",        5.0, 3.5, False),

        # Floor 2 – horizontal
        ("r201",       "c2",          15.0, 2.0, False),
        ("r202",       "c2",          10.0, 2.0, False),
        ("r203",       "c2",          15.0, 2.0, False),
        ("c2",         "stair_a_f2",  20.0, 2.5, False),
        ("c2",         "stair_b_f2",  20.0, 2.5, False),

        # Floor 3 – horizontal
        ("r301",       "c3",          15.0, 2.0, False),
        ("r302",       "c3",          10.0, 2.0, False),
        ("r303",       "c3",          15.0, 2.0, False),
        ("c3",         "stair_a_f3",  20.0, 2.5, False),
        ("c3",         "stair_b_f3",  20.0, 2.5, False),

        # Vertical stairwell segments (F1↔F2, F2↔F3)
        ("stair_a_f1", "stair_a_f2",  12.0, 1.5, True),
        ("stair_a_f2", "stair_a_f3",  12.0, 1.5, True),
        ("stair_b_f1", "stair_b_f2",  12.0, 1.5, True),
        ("stair_b_f2", "stair_b_f3",  12.0, 1.5, True),
    ]

    for u, v, dist, width, is_stair in edge_defs:
        # Use average crowd density of the two endpoint nodes
        density = (crowd_densities.get(u, 0.0) + crowd_densities.get(v, 0.0)) / 2.0
        weight = calculate_edge_weight(dist, density, 0.0, is_stair)
        base_time = calculate_edge_weight(dist, 0.0, 0.0, is_stair)
        G.add_edge(u, v,
                   weight=weight,
                   distance=dist,
                   width=width,
                   is_stair=is_stair,
                   base_time=base_time,
                   crowd_density=density)

    return G


def get_exits(G: nx.Graph) -> list[str]:
    """Return all exit node IDs in the graph."""
    return [n for n, d in G.nodes(data=True) if d.get("type") == "exit"]


def apply_smoke(G: nx.Graph, blocked_edges: list[Tuple[str, str]]) -> None:
    """
    Mark edges as smoke-blocked by setting weight to infinity.
    Mutates G in place — call on a copy if you need the original.

    Smoke spread direction (from weather wind) is handled upstream:
    the caller provides which edges are blocked.
    """
    for u, v in blocked_edges:
        if G.has_edge(u, v):
            G[u][v]["weight"] = float("inf")
            G[u][v]["smoke_blocked"] = True


def remove_node_safe(G: nx.Graph, node_id: str) -> bool:
    """
    Remove a node and all its edges (broken exit, collapsed stair).
    Returns True if node existed and was removed.
    """
    if node_id in G:
        G.remove_node(node_id)
        return True
    return False


def update_crowd_density(G: nx.Graph, node_id: str, density: float) -> None:
    """
    Recalculate weights for all edges adjacent to node_id after a
    crowd-density change. density ∈ [0, 1).
    """
    if node_id not in G:
        return
    for neighbor in list(G.neighbors(node_id)):
        e = G[node_id][neighbor]
        avg_density = (density + e.get("crowd_density", 0.0)) / 2.0
        risk = e.get("smoke_level", 0.0)
        e["weight"] = calculate_edge_weight(
            e["distance"], avg_density, risk, e.get("is_stair", False)
        )
        e["crowd_density"] = avg_density
