"""
pathfinding.py — Dijkstra and A* evacuation route finders

Algorithm overview:
  Dijkstra: explores nodes in non-decreasing cost order using a min-heap.
            Guarantees shortest path on non-negative weights. O((V+E) log V).

  A*: Dijkstra + admissible heuristic h(n) to guide search toward the goal.
      Uses Euclidean distance on the node x/y coordinates as h(n).
      h(n) ≤ true cost → A* is optimal (admissible + consistent here).
      Typically explores fewer nodes than Dijkstra on spatial graphs.

Both return the same path; A* is usually faster to compute in practice.
"""

import heapq
import math
import time
import networkx as nx
from typing import Optional


# Walking speed used to convert Euclidean pixel distance to estimated seconds.
# Pixels-per-metre ratio in our layout (see graph_builder.py): ~6 px/m
_PX_PER_METRE = 6.0
_WALK_SPEED = 1.4   # m/s


def _euclidean_heuristic(G: nx.Graph, u: str, v: str) -> float:
    """
    Admissible heuristic: straight-line time between u and v.
    Uses node x/y pixel positions converted to metres then to seconds.
    h(u) ≤ actual cost always holds because walls/stairs add extra time.
    """
    ux, uy = G.nodes[u]["x"], G.nodes[u]["y"]
    vx, vy = G.nodes[v]["x"], G.nodes[v]["y"]
    pixel_dist = math.hypot(vx - ux, vy - uy)
    metres = pixel_dist / _PX_PER_METRE
    return metres / _WALK_SPEED  # seconds


def dijkstra(
    G: nx.Graph,
    source: str,
    target: str,
) -> tuple[list[str], float] | tuple[None, float]:
    """
    Single-source shortest path from source to target using Dijkstra's algorithm.

    Returns (path_as_node_list, total_cost) or (None, inf) if unreachable.
    Edges with weight=inf (smoke-blocked) are treated as impassable.
    """
    if source not in G or target not in G:
        return None, float("inf")

    dist: dict[str, float] = {source: 0.0}
    prev: dict[str, Optional[str]] = {source: None}
    heap: list[tuple[float, str]] = [(0.0, source)]

    while heap:
        cost, u = heapq.heappop(heap)
        if cost > dist.get(u, float("inf")):
            continue  # stale entry
        if u == target:
            break

        for v, edge_data in G[u].items():
            w = edge_data.get("weight", float("inf"))
            if w == float("inf"):
                continue  # smoke-blocked or otherwise impassable
            new_cost = cost + w
            if new_cost < dist.get(v, float("inf")):
                dist[v] = new_cost
                prev[v] = u
                heapq.heappush(heap, (new_cost, v))

    if target not in dist or dist[target] == float("inf"):
        return None, float("inf")

    # Reconstruct path
    path = []
    node = target
    while node is not None:
        path.append(node)
        node = prev[node]
    path.reverse()
    return path, dist[target]


def astar(
    G: nx.Graph,
    source: str,
    target: str,
) -> tuple[list[str], float] | tuple[None, float]:
    """
    A* shortest path from source to target.
    Uses Euclidean pixel distance as an admissible heuristic.

    Returns (path_as_node_list, total_cost) or (None, inf) if unreachable.
    """
    if source not in G or target not in G:
        return None, float("inf")

    g_score: dict[str, float] = {source: 0.0}
    prev: dict[str, Optional[str]] = {source: None}
    # heap entries: (f_score, g_score_tiebreaker, node)
    heap: list[tuple[float, float, str]] = [
        (_euclidean_heuristic(G, source, target), 0.0, source)
    ]

    while heap:
        f, g, u = heapq.heappop(heap)
        if g > g_score.get(u, float("inf")):
            continue  # stale
        if u == target:
            break

        for v, edge_data in G[u].items():
            w = edge_data.get("weight", float("inf"))
            if w == float("inf"):
                continue
            tentative_g = g_score[u] + w
            if tentative_g < g_score.get(v, float("inf")):
                g_score[v] = tentative_g
                prev[v] = u
                f_score = tentative_g + _euclidean_heuristic(G, v, target)
                heapq.heappush(heap, (f_score, tentative_g, v))

    if target not in g_score or g_score[target] == float("inf"):
        return None, float("inf")

    path = []
    node = target
    while node is not None:
        path.append(node)
        node = prev[node]
    path.reverse()
    return path, g_score[target]


def find_all_exit_routes(
    G: nx.Graph,
    source: str,
    exits: list[str],
    algorithm: str = "dijkstra",
) -> list[dict]:
    """
    Run pathfinding from source to every exit and return results sorted by cost.

    Args:
        G: building graph (may have blocked edges for dynamic conditions)
        source: starting node (fire location or occupied room)
        exits: list of exit node IDs
        algorithm: "dijkstra" | "astar"

    Returns:
        List of dicts, each describing one route:
          {exit, path, cost_seconds, reachable, algorithm}
        Sorted by cost_seconds ascending (best route first).
    """
    fn = dijkstra if algorithm == "dijkstra" else astar
    results = []

    for exit_node in exits:
        if exit_node == source:
            continue
        path, cost = fn(G, source, exit_node)
        results.append({
            "exit": exit_node,
            "path": path or [],
            "cost_seconds": round(cost, 1) if cost != float("inf") else None,
            "reachable": path is not None,
            "algorithm": algorithm,
        })

    results.sort(key=lambda r: (not r["reachable"], r["cost_seconds"] or float("inf")))
    return results


def compare_algorithms(
    G: nx.Graph,
    source: str,
    exits: list[str],
) -> dict:
    """
    Run both algorithms and return results keyed by algorithm name.
    Includes wall-clock execution time in milliseconds for each algorithm.
    Used for the before/after comparison table in the frontend.
    """
    t0 = time.perf_counter()
    dijkstra_routes = find_all_exit_routes(G, source, exits, "dijkstra")
    dijkstra_ms = round((time.perf_counter() - t0) * 1000, 3)

    t0 = time.perf_counter()
    astar_routes = find_all_exit_routes(G, source, exits, "astar")
    astar_ms = round((time.perf_counter() - t0) * 1000, 3)

    return {
        "dijkstra": dijkstra_routes,
        "astar":    astar_routes,
        "timing_ms": {"dijkstra": dijkstra_ms, "astar": astar_ms},
    }


def estimate_evacuation_time(
    G: nx.Graph,
    occupied_nodes: list[str],
    exits: list[str],
    algorithm: str = "dijkstra",
) -> dict:
    """
    Estimate total building evacuation time given which nodes are occupied.

    Strategy: for each occupied node, find the nearest reachable exit.
    The building evacuation time is the maximum individual route time
    (the last person to escape sets the overall duration).

    Returns summary dict with per-room routes and overall_seconds.
    """
    per_room = {}
    max_time = 0.0

    for node in occupied_nodes:
        routes = find_all_exit_routes(G, node, exits, algorithm)
        best = routes[0] if routes else None
        per_room[node] = best
        if best and best["reachable"]:
            t = best["cost_seconds"] or 0.0
            if t > max_time:
                max_time = t

    return {
        "overall_seconds": round(max_time, 1),
        "per_room": per_room,
        "algorithm": algorithm,
    }
