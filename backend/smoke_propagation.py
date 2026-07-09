"""
smoke_propagation.py — Continuous smoke level model for edge-by-edge propagation.

Formula (per edge e):
    s(e) = s_fire * exp(-λ * dist(e, fire_m)) * φ(θ_wind)

Where:
    s_fire  = 1.0   (base smoke concentration at fire node)
    λ       = 0.15  (exponential decay rate per metre)
    dist(e) = Euclidean distance in metres from fire node to edge midpoint
    φ       = 1.0 + 0.5 * cos(angle between edge direction and wind direction)
            → edges aligned with wind get +50% extra smoke; opposite = −50%

Smoke-modified edge weight (R(e) = s(e) fed into weight formula from graph_builder):
    if s(e) >= 0.9:  weight = inf          (impassable — lethal smoke)
    else:            weight = d / (v_base × (1 − ρ(e)) × (1 − s(e)))

This model is used by POST /buildings/{id}/smoke/propagate and integrates with
the main evacuation engine when a fire incident is reported.
"""

import math

import networkx as nx

from graph_builder import calculate_edge_weight

LAMBDA = 0.15  # exponential decay rate (per metre)
PX_PER_M = 6.0  # pixels per metre (matches graph_builder.py)
S_FIRE = 1.0  # smoke concentration at fire source
BLOCK_THR = 0.9  # smoke level that makes edge impassable


def compute_smoke_levels(
    fire_node: str,
    G: nx.Graph,
    wind_direction_deg: float,
    wind_speed_ms: float,
) -> dict[tuple[str, str], float]:
    """
    Compute continuous smoke level s ∈ [0, 1] for every edge in the graph.

    Per the model (README / evacuation_report_final.pdf), smoke depends on
    distance from the fire and on wind DIRECTION only:
        s(e) = s_fire × exp(−λ × dist) × φ(θ_wind)
    Wind SPEED does not enter this formula — it affects fire spread speed
    instead (see fire_spread.py).

    Args:
        fire_node:         node_key of the fire source
        G:                 building NetworkX graph (nodes must have x, y attributes)
        wind_direction_deg: direction wind blows FROM (degrees, 0=N, 90=E)
        wind_speed_ms:     accepted for interface symmetry with fire_spread;
                           unused by this formula (see note above)

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
    wx = math.sin(toward_rad)  # east component (+x)
    wy = -math.cos(toward_rad)  # north component (screen y flipped)

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
        dist_m = dist_px / PX_PER_M

        # phi: wind alignment factor (from wind direction only)
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
        s = S_FIRE * math.exp(-LAMBDA * dist_m) * phi

        # Clamp to [0, 1]
        s = max(0.0, min(1.0, s))
        levels[(u, v)] = s

    return levels


def apply_smoke_levels(G: nx.Graph, smoke_levels: dict[tuple[str, str], float]) -> None:
    """
    Rewrite edge weights in G according to the smoke-modified weight formula.

    Formula:
        s >= 0.9 → weight = inf
        s <  0.9 → weight = d / (v_base × (1 − ρ) × (1 − s))

    Mutates G in place. Call on a copy if you need the original weights.
    The `smoke_level` attribute is stored on each edge for visualisation.
    """
    for (u, v), s in smoke_levels.items():
        if not G.has_edge(u, v):
            continue
        e = G[u][v]
        e["smoke_level"] = round(s, 4)
        e["smoke_blocked"] = s >= BLOCK_THR

        if s >= BLOCK_THR:
            e["weight"] = float("inf")
        else:
            e["weight"] = calculate_edge_weight(
                e["distance"],
                e.get("crowd_density", 0.0),
                s,
                e.get("is_stair", False),
            )


def smoke_levels_to_cytoscape(smoke_levels: dict[tuple[str, str], float]) -> list[dict]:
    """
    Convert smoke_levels dict to a list of edge annotations for the frontend.

    Returns [{source, target, smoke_level, blocked}, ...]
    """
    return [
        {
            "source": u,
            "target": v,
            "smoke_level": round(s, 4),
            "blocked": s >= BLOCK_THR,
        }
        for (u, v), s in smoke_levels.items()
    ]
