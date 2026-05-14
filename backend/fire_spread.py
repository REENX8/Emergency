"""
fire_spread.py — Physics-based fire spread simulation using Dijkstra's algorithm.

Model (per edge e, directed from u to v):
    v_fire(e) = V_BASE × type_mult(dest_node) × width_factor(edge) × wind_factor(edge)

Where:
    V_BASE        = 0.02 m/s  (~1.2 m/min, typical building fire)
    type_mult     = {room: 1.0, corridor: 1.5, stair: 2.5, exit: 0.5}
    width_factor  = min(1.0, width_m / 2.0)
    wind_factor   = 1.0 + 0.8 × max(0, cos_angle) × (wind_speed_ms / 5.0)
        where cos_angle = dot(edge_unit_vec, wind_dir_vec)
        and wind_dir_vec = (sin(wind_rad), -cos(wind_rad))  [screen coords, y-down]

    t_spread(e) = distance_m / v_fire(e)

Algorithm: Dijkstra from fire source, minimize cumulative t_spread.
Edges with weight==inf (smoke-blocked) are skipped.
"""

import math
import heapq
import networkx as nx

# Base fire spread speed (m/s)
V_BASE = 0.02

# Type multipliers for destination node type
TYPE_MULT = {
    "room":     1.0,
    "corridor": 1.5,
    "stair":    2.5,
    "exit":     0.5,
}
DEFAULT_TYPE_MULT = 1.0


def _type_mult(node_type: str) -> float:
    """Return fire spread multiplier for the destination node type."""
    return TYPE_MULT.get(node_type, DEFAULT_TYPE_MULT)


def _width_factor(width_m: float) -> float:
    """Narrower edges spread fire slower (less fuel surface area accessible)."""
    return min(1.0, width_m / 2.0)


def _wind_factor(
    ux: float, uy: float,
    vx: float, vy: float,
    wind_direction_deg: float,
    wind_speed_ms: float,
) -> float:
    """
    Compute wind alignment factor for a directed edge from (ux,uy) to (vx,vy).

    wind_direction_deg: direction wind blows FROM (compass, 0=N, 90=E)
    Screen coords: y increases downward.
    Fire travels WITH the wind, i.e. TOWARD (wind_direction_deg + 180°).
        toward_vec = (sin(toward_rad), -cos(toward_rad))  [screen coords, y-down]
    """
    if wind_speed_ms <= 0:
        return 1.0

    # wind_direction_deg is direction FROM which wind blows (meteorological convention).
    # Fire travels WITH the wind, i.e. TOWARD (wind_direction_deg + 180°).
    toward_rad = math.radians((wind_direction_deg + 180.0) % 360.0)
    wx = math.sin(toward_rad)
    wy = -math.cos(toward_rad)

    dx = vx - ux
    dy = vy - uy
    dist = math.hypot(dx, dy)

    if dist == 0:
        return 1.0

    # Unit edge direction vector
    ex = dx / dist
    ey = dy / dist

    cos_angle = ex * wx + ey * wy

    return 1.0 + 0.8 * max(0.0, cos_angle) * (wind_speed_ms / 5.0)


def _spread_time(
    G: nx.Graph,
    u: str, v: str,
    wind_direction_deg: float,
    wind_speed_ms: float,
) -> float:
    """
    Compute fire spread time (seconds) along a directed edge from u to v.

    Returns float('inf') if the edge is smoke-blocked (weight == inf).
    """
    edge_data = G[u][v]

    # Skip smoke-blocked edges
    if edge_data.get("weight", 0) == float("inf"):
        return float("inf")

    distance_m = edge_data.get("distance", 1.0)
    width_m    = edge_data.get("width",    2.0)

    dest_type   = G.nodes[v].get("type", "room")
    ux          = G.nodes[u].get("x", 0)
    uy          = G.nodes[u].get("y", 0)
    vx          = G.nodes[v].get("x", 0)
    vy          = G.nodes[v].get("y", 0)

    tm  = _type_mult(dest_type)
    wf  = _width_factor(width_m)
    wnd = _wind_factor(ux, uy, vx, vy, wind_direction_deg, wind_speed_ms)

    v_fire = V_BASE * tm * wf * wnd

    if v_fire <= 0:
        return float("inf")

    return distance_m / v_fire


def compute_fire_spread(
    fire_node: str,
    G: nx.Graph,
    wind_direction_deg: float = 0.0,
    wind_speed_ms: float = 0.0,
) -> dict:
    """
    Compute fire spread times from a fire source node using Dijkstra's algorithm.

    The fire spreads along edges, minimizing cumulative spread time.
    Smoke-blocked edges (weight == inf) are skipped.

    Args:
        fire_node:          node_key of the fire origin
        G:                  building NetworkX graph (undirected)
        wind_direction_deg: direction wind blows FROM (compass degrees, 0=N)
        wind_speed_ms:      wind speed in m/s

    Returns:
        {
            "reach_time":   {node_key: seconds_to_reach, ...},
            "spread_order": [node_keys sorted by reach time, fire_node first],
            "unreachable":  [node_keys fire cannot reach],
        }
    """
    if fire_node not in G:
        return {
            "reach_time":   {},
            "spread_order": [],
            "unreachable":  list(G.nodes()),
        }

    # Dijkstra: priority queue of (time, node)
    dist: dict[str, float] = {fire_node: 0.0}
    heap: list = [(0.0, fire_node)]

    while heap:
        t, u = heapq.heappop(heap)

        if t > dist.get(u, float("inf")):
            continue  # stale entry

        for v in G.neighbors(u):
            # Fire spreads FROM u TO v: use v's type multiplier (destination matters)
            dt = _spread_time(G, u, v, wind_direction_deg, wind_speed_ms)

            new_t = t + dt
            if new_t < dist.get(v, float("inf")):
                dist[v] = new_t
                heapq.heappush(heap, (new_t, v))

    all_nodes = list(G.nodes())
    reachable  = {n: t for n, t in dist.items() if t < float("inf")}
    unreachable = [n for n in all_nodes if n not in reachable]
    spread_order = sorted(reachable.keys(), key=lambda n: reachable[n])

    return {
        "reach_time":   reachable,
        "spread_order": spread_order,
        "unreachable":  unreachable,
    }


def fire_nodes_at_time(reach_time: dict, t_seconds: float) -> list:
    """
    Return list of node keys where fire has arrived by time t_seconds.

    Args:
        reach_time: dict mapping node_key → seconds (from compute_fire_spread)
        t_seconds:  query time in seconds

    Returns:
        List of node keys where reach_time[node] <= t_seconds
    """
    return [n for n, t in reach_time.items() if t <= t_seconds]


def fire_spread_to_cytoscape(reach_time: dict) -> list:
    """
    Convert reach_time dict to a Cytoscape-friendly list sorted by reach time.

    Args:
        reach_time: dict mapping node_key → seconds

    Returns:
        [{"node": node_key, "reach_time": float}, ...] sorted ascending by reach_time
    """
    return sorted(
        [{"node": n, "reach_time": round(t, 2)} for n, t in reach_time.items()],
        key=lambda x: x["reach_time"],
    )
