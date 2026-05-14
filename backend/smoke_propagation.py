"""
smoke_propagation.py — Continuous smoke level model for edge-by-edge propagation.

Formula (per edge e):
    s(e) = s_fire * exp(-lambda * dist(e, fire_m)) * phi(wind_angle)

Where:
    s_fire  = 1.0   (base smoke concentration at fire node)
    lambda  = 0.15  (exponential decay rate per metre)
    dist(e) = Euclidean distance in metres from fire node to edge midpoint
    phi     = 1.0 + 0.5 * cos(angle between edge direction and wind direction)
            → edges aligned with wind get +50% extra smoke; opposite = -50%

Smoke-modified edge weight formula (replaces calculate_edge_weight):
    if s(e) >= 0.9:  weight = inf          (impassable — lethal smoke)
    else:            weight = base_time * (1 + 2 * crowd_density) * (1 + 4 * s(e))

This model is used by POST /buildings/{id}/smoke/propagate and integrates with
the main evacuation engine when a fire incident is reported.
"""

import math
import networkx as nx

LAMBDA     = 0.15   # exponential decay rate (per metre)
PX_PER_M   = 6.0    # pixels per metre (matches graph_builder.py)
S_FIRE     = 1.0    # smoke concentration at fire source
BLOCK_THR  = 0.9    # smoke level that makes edge impassable


def compute_smoke_levels(
    fire_node: str,
    G: nx.Graph,
    wind_direction_deg: float,
    wind_speed_ms: float,
) -> dict[tuple[str, str], float]:
    """
    Compute continuous smoke level s ∈ [0, 1] for every edge in the graph.

    Args:
        fire_node:         node_key of the fire source
        G:                 building NetworkX graph (nodes must have x, y attributes)
        wind_direction_deg: direction wind blows FROM (degrees, 0=N, 90=E)
        wind_speed_ms:     wind speed in m/s (scales effective spread radius)

    Returns:
        dict mapping (u, v) tuple → smoke level [0, 1].
        Edges not in the graph are omitted.
    """
    if fire_node not in G:
        return {}

    fx = G.nodes[fire_node].get("x", 0)
    fy = G.nodes[fire_node].get("y", 0)

    # Wind travels TOWARD (direction + 180°), same convention as weather.py
    toward_deg = (wind_direction_deg + 180) % 360
    toward_rad = math.radians(toward_deg)
    # Compass → screen: 0°=N means +y on screen (y increases downward)
    wx = math.sin(toward_rad)    # east component (+x)
    wy = -math.cos(toward_rad)   # north component (screen y flipped)

    # Wind speed amplifies spread: 0 m/s → no extra, 10 m/s → 50% extra
    speed_factor = 1.0 + wind_speed_ms / 20.0

    levels: dict[tuple[str, str], float] = {}

    for u, v in G.edges():
        ux = G.nodes[u].get("x", 0)
        uy = G.nodes[u].get("y", 0)
        vx = G.nodes[v].get("x", 0)
        vy = G.nodes[v].get("y", 0)

        # Midpoint of edge
        mid_x = (ux + vx) / 2.0
        mid_y = (uy + vy) / 2.0

        # Distance from fire to midpoint in metres
        dist_px = math.hypot(mid_x - fx, mid_y - fy)
        dist_m  = dist_px / PX_PER_M

        # phi: wind alignment factor
        # edge direction vector
        ex = vx - ux
        ey = vy - uy
        e_len = math.hypot(ex, ey)
        if e_len > 0:
            ex /= e_len
            ey /= e_len
            cos_angle = ex * wx + ey * wy
        else:
            cos_angle = 0.0

        phi = 1.0 + 0.5 * cos_angle

        # Exponential decay
        s = S_FIRE * math.exp(-LAMBDA * dist_m / speed_factor) * phi

        # Clamp to [0, 1]
        s = max(0.0, min(1.0, s))
        levels[(u, v)] = s

    return levels


def apply_smoke_levels(G: nx.Graph, smoke_levels: dict[tuple[str, str], float]) -> None:
    """
    Rewrite edge weights in G according to the smoke-modified weight formula.

    Formula:
        s >= 0.9 → weight = inf
        s <  0.9 → weight = base_time * (1 + 2 * crowd_density) * (1 + 4 * s)

    Mutates G in place. Call on a copy if you need the original weights.
    The `smoke_level` attribute is stored on each edge for visualisation.
    """
    for (u, v), s in smoke_levels.items():
        if not G.has_edge(u, v):
            continue
        e = G[u][v]
        e["smoke_level"] = round(s, 4)
        e["smoke_blocked"] = s >= BLOCK_THR

        base_time = e.get("base_time", e.get("weight", 1.0))
        crowd     = e.get("crowd_density", 0.0)

        if s >= BLOCK_THR:
            e["weight"] = float("inf")
        else:
            e["weight"] = base_time * (1.0 + 2.0 * crowd) * (1.0 + 4.0 * s)


def smoke_levels_to_cytoscape(smoke_levels: dict[tuple[str, str], float]) -> list[dict]:
    """
    Convert smoke_levels dict to a list of edge annotations for the frontend.

    Returns [{source, target, smoke_level, blocked}, ...]
    """
    return [
        {
            "source":      u,
            "target":      v,
            "smoke_level": round(s, 4),
            "blocked":     s >= BLOCK_THR,
        }
        for (u, v), s in smoke_levels.items()
    ]
