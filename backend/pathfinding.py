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

# Fastest possible walking speed in the weight model (corridor, no crowd,
# no smoke). Real edge weights are always >= distance_m / _WALK_SPEED.
_WALK_SPEED = 1.4  # m/s


def _px_per_metre_upper_bound(G: nx.Graph) -> float:
    """
    Largest pixels-per-metre ratio observed on any edge of this graph.

    Converting a straight-line pixel distance to metres with this ratio
    UNDERestimates the true metre distance, which keeps the A* heuristic
    admissible regardless of the drawing scale (layouts are not all 6 px/m,
    and stored `distance_m` is independent of pixel geometry).

    Cached on G.graph — topology mutations rebuild the graph, so per-graph
    caching is safe.
    """
    cached = G.graph.get("_h_px_per_m")
    if cached is not None:
        return cached
    ratio = 0.0
    for u, v, data in G.edges(data=True):
        d_m = float(data.get("distance", 0) or 0)
        if d_m <= 0:
            continue
        px = math.hypot(
            G.nodes[v].get("x", 0) - G.nodes[u].get("x", 0),
            G.nodes[v].get("y", 0) - G.nodes[u].get("y", 0),
        )
        if px > 0:
            ratio = max(ratio, px / d_m)
    G.graph["_h_px_per_m"] = ratio
    return ratio


def _euclidean_heuristic(G: nx.Graph, u: str, v: str) -> float:
    """
    Admissible heuristic: straight-line time between u and v in seconds.

    Pixel distance is converted to metres with the per-graph max px/m ratio
    (underestimates metres) and divided by the max walking speed
    (underestimates time), so h(u) ≤ true cost always holds — A* stays
    optimal and agrees with Dijkstra.
    """
    ratio = _px_per_metre_upper_bound(G)
    if ratio <= 0:
        return 0.0  # no usable geometry — degrade to Dijkstra
    ux, uy = G.nodes[u]["x"], G.nodes[u]["y"]
    vx, vy = G.nodes[v]["x"], G.nodes[v]["y"]
    pixel_dist = math.hypot(vx - ux, vy - uy)
    return (pixel_dist / ratio) / _WALK_SPEED  # seconds


def _dijkstra_full(
    G: nx.Graph,
    source: str,
    target: str,
) -> tuple[list[str] | None, float, int]:
    """
    Dijkstra returning (path, cost, nodes_settled).
    Internal function — callers that need nodes_visited use this.
    """
    if source not in G or target not in G:
        return None, float("inf"), 0

    dist: dict[str, float] = {source: 0.0}
    prev: dict[str, str | None] = {source: None}
    heap: list[tuple[float, str]] = [(0.0, source)]
    nodes_settled = 0

    while heap:
        cost, u = heapq.heappop(heap)
        if cost > dist.get(u, float("inf")):
            continue
        nodes_settled += 1
        if u == target:
            break

        for v, edge_data in G[u].items():
            w = edge_data.get("weight", float("inf"))
            if w == float("inf"):
                continue
            new_cost = cost + w
            if new_cost < dist.get(v, float("inf")):
                dist[v] = new_cost
                prev[v] = u
                heapq.heappush(heap, (new_cost, v))

    if target not in dist or dist[target] == float("inf"):
        return None, float("inf"), nodes_settled

    path = []
    node = target
    while node is not None:
        path.append(node)
        node = prev[node]
    path.reverse()
    return path, dist[target], nodes_settled


def _astar_full(
    G: nx.Graph,
    source: str,
    target: str,
) -> tuple[list[str] | None, float, int]:
    """
    A* returning (path, cost, nodes_settled).
    Internal function — callers that need nodes_visited use this.
    """
    if source not in G or target not in G:
        return None, float("inf"), 0

    g_score: dict[str, float] = {source: 0.0}
    prev: dict[str, str | None] = {source: None}
    heap: list[tuple[float, float, str]] = [(_euclidean_heuristic(G, source, target), 0.0, source)]
    nodes_settled = 0

    while heap:
        f, g, u = heapq.heappop(heap)
        if g > g_score.get(u, float("inf")):
            continue
        nodes_settled += 1
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
        return None, float("inf"), nodes_settled

    path = []
    node = target
    while node is not None:
        path.append(node)
        node = prev[node]
    path.reverse()
    return path, g_score[target], nodes_settled


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
    path, cost, _ = _dijkstra_full(G, source, target)
    return path, cost


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
    path, cost, _ = _astar_full(G, source, target)
    return path, cost


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
          {exit, path, cost_seconds, reachable, algorithm, nodes_visited}
        Sorted by cost_seconds ascending (best route first).
    """
    fn = _dijkstra_full if algorithm == "dijkstra" else _astar_full
    results = []

    for exit_node in exits:
        if exit_node == source:
            continue
        path, cost, nodes_visited = fn(G, source, exit_node)
        results.append(
            {
                "exit": exit_node,
                "path": path or [],
                "cost_seconds": round(cost, 1) if cost != float("inf") else None,
                "reachable": path is not None,
                "algorithm": algorithm,
                "nodes_visited": nodes_visited,
            }
        )

    results.sort(key=lambda r: (not r["reachable"], r["cost_seconds"] or float("inf")))
    return results


def compare_algorithms(
    G: nx.Graph,
    source: str,
    exits: list[str],
) -> dict:
    """
    Run both algorithms and return results keyed by algorithm name.
    Includes wall-clock execution time in milliseconds and nodes_visited for each.
    """
    t0 = time.perf_counter()
    dijkstra_routes = find_all_exit_routes(G, source, exits, "dijkstra")
    dijkstra_ms = round((time.perf_counter() - t0) * 1000, 3)

    t0 = time.perf_counter()
    astar_routes = find_all_exit_routes(G, source, exits, "astar")
    astar_ms = round((time.perf_counter() - t0) * 1000, 3)

    dijkstra_nodes = sum(r["nodes_visited"] for r in dijkstra_routes)
    astar_nodes = sum(r["nodes_visited"] for r in astar_routes)

    return {
        "dijkstra": dijkstra_routes,
        "astar": astar_routes,
        "timing_ms": {"dijkstra": dijkstra_ms, "astar": astar_ms},
        "nodes_visited": {"dijkstra": dijkstra_nodes, "astar": astar_nodes},
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
