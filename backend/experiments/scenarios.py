"""
Scenario factories — produce a per-trial NetworkX graph variant.

Each factory takes the base graph + a single value of the swept variable
and returns a mutated copy. Factories must be deterministic given the
same (G, value, rng) inputs so a `seed` reproduces identical sweeps.

Supported variables:
  - "wind_speed"     : multiplies smoke_level on each edge by a wind factor
  - "fire_severity"  : scales smoke_level proportionally (0..1)
  - "crowd_density"  : uniform crowd density on all room-adjacent edges
  - "fire_location"  : returns the graph as-is but the fire source moves
                       (handled by caller; this factory is a no-op)
"""

from __future__ import annotations

import copy
import random
from collections.abc import Callable

import networkx as nx

from graph_builder import calculate_edge_weight

ScenarioFn = Callable[[nx.Graph, float, random.Random], nx.Graph]


def _wind_speed_factor(speed_ms: float) -> float:
    """Linear bump up to 5 m/s, then saturate. Mirrors the smoke model
    intuition (wind accelerates spread but saturates)."""
    return 1.0 + 0.3 * min(5.0, max(0.0, speed_ms))


def wind_speed(G: nx.Graph, value: float, _rng: random.Random) -> nx.Graph:
    Gx = copy.deepcopy(G)
    factor = _wind_speed_factor(value)
    for _u, _v, data in Gx.edges(data=True):
        if data.get("smoke_blocked"):
            continue  # blocked by a live smoke incident — never reopen
        smoke = float(data.get("smoke_level", 0.0)) * factor
        smoke = min(1.0, smoke)
        data["smoke_level"] = smoke
        if smoke >= 0.9:
            data["weight"] = float("inf")
        else:
            data["weight"] = calculate_edge_weight(
                data.get("distance", 10),
                data.get("crowd_density", 0.0),
                smoke,
                data.get("is_stair", False),
            )
    return Gx


def fire_severity(G: nx.Graph, value: float, _rng: random.Random) -> nx.Graph:
    Gx = copy.deepcopy(G)
    sev = max(0.0, min(1.0, float(value)))
    for _u, _v, data in Gx.edges(data=True):
        if data.get("smoke_blocked"):
            continue  # blocked by a live smoke incident — never reopen
        smoke = float(data.get("smoke_level", 0.0)) * sev
        data["smoke_level"] = smoke
        if smoke >= 0.9:
            data["weight"] = float("inf")
        else:
            data["weight"] = calculate_edge_weight(
                data.get("distance", 10),
                data.get("crowd_density", 0.0),
                smoke,
                data.get("is_stair", False),
            )
    return Gx


def crowd_density(G: nx.Graph, value: float, _rng: random.Random) -> nx.Graph:
    """Apply a uniform crowd density on edges that touch a room."""
    Gx = copy.deepcopy(G)
    density = max(0.0, min(0.99, float(value)))
    for u, v, data in Gx.edges(data=True):
        if data.get("smoke_blocked"):
            continue  # blocked by a live smoke incident — never reopen
        u_type = Gx.nodes[u].get("type", "")
        v_type = Gx.nodes[v].get("type", "")
        if "room" in (u_type, v_type):
            data["crowd_density"] = density
            data["weight"] = calculate_edge_weight(
                data.get("distance", 10),
                density,
                data.get("smoke_level", 0.0),
                data.get("is_stair", False),
            )
    return Gx


def fire_location(G: nx.Graph, _value: float, _rng: random.Random) -> nx.Graph:
    """No-op — the caller varies the fire_location node per trial."""
    return copy.deepcopy(G)


REGISTRY: dict[str, ScenarioFn] = {
    "wind_speed": wind_speed,
    "fire_severity": fire_severity,
    "crowd_density": crowd_density,
    "fire_location": fire_location,
}


def get(name: str) -> ScenarioFn:
    if name not in REGISTRY:
        raise ValueError(f"Unknown sweep variable: {name}. Choose from {sorted(REGISTRY)}")
    return REGISTRY[name]
