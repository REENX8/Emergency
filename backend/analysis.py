"""
analysis.py — Graph analysis: connectivity, bottleneck detection, safety score,
              max-flow distribution, and automated experiment runner.

All functions operate on a NetworkX graph G already loaded from the database
(via dynamic_graph.build_graph_from_db). No DB access here.
"""

import csv
import io
import math
import time
import copy
import networkx as nx

from pathfinding import find_all_exit_routes, compare_algorithms


# ---------------------------------------------------------------------------
# 1. Connectivity check
# ---------------------------------------------------------------------------

def check_connectivity(
    G: nx.Graph,
    blocked_edges: list[tuple[str, str]] | None = None,
) -> dict:
    """
    Test whether the building graph remains connected after optional edge removals.

    Args:
        G: building graph
        blocked_edges: list of (u, v) tuples to temporarily remove

    Returns:
        {
            is_connected: bool,
            num_components: int,
            unreachable_nodes: list[str],   # nodes not in main component
            components: list[list[str]],    # all connected components
        }
    """
    G_test = G.copy()
    for u, v in (blocked_edges or []):
        if G_test.has_edge(u, v):
            G_test.remove_edge(u, v)

    components = list(nx.connected_components(G_test))
    components.sort(key=len, reverse=True)  # largest first

    main = components[0] if components else set()
    unreachable = sorted(
        [n for comp in components[1:] for n in comp]
    )

    return {
        "is_connected":     len(components) <= 1,
        "num_components":   len(components),
        "unreachable_nodes": unreachable,
        "components":       [sorted(c) for c in components],
    }


# ---------------------------------------------------------------------------
# 2. Bottleneck detection
# ---------------------------------------------------------------------------

def find_bottlenecks(G: nx.Graph) -> dict:
    """
    Identify structurally critical edges and nodes.

    Critical edges (bridges): removal disconnects the graph.
    Critical nodes (articulation points): removal disconnects the graph.
    Minimum edge cut: smallest set of edges whose removal disconnects the graph.

    Returns:
        {
            bridge_edges:          [(u, v), ...],
            articulation_points:   [node_id, ...],
            min_edge_cut_size:     int,
            min_edge_cut:          [(u, v), ...],
            severity:              float   # 0.0 = no bottleneck, 1.0 = very severe
        }
    """
    bridge_edges = list(nx.bridges(G)) if G.number_of_nodes() > 1 else []
    art_points   = list(nx.articulation_points(G)) if G.number_of_nodes() > 1 else []

    # Minimum edge cut (may raise if graph is empty or disconnected)
    min_cut: list[tuple[str, str]] = []
    min_cut_size = 0
    try:
        if nx.is_connected(G) and G.number_of_edges() > 0:
            cut_set = nx.minimum_edge_cut(G)
            min_cut = [tuple(e) for e in cut_set]
            min_cut_size = len(cut_set)
    except Exception:
        pass

    n_edges = max(G.number_of_edges(), 1)
    severity = round(len(bridge_edges) / n_edges, 4)

    return {
        "bridge_edges":        [list(e) for e in bridge_edges],
        "articulation_points": art_points,
        "min_edge_cut_size":   min_cut_size,
        "min_edge_cut":        [list(e) for e in min_cut],
        "severity":            severity,
    }


# ---------------------------------------------------------------------------
# 3. Safety score
# ---------------------------------------------------------------------------

def compute_safety_score(G: nx.Graph) -> dict:
    """
    Compute a composite safety score (0–100) for the building graph.

    S = 40 × min(1, N_exit / (V_total/5))
      + 30 × min(1, C_min_cut / (P_total/10))
      + 30 × (λ(G) / (k+1))

    N_exit    = number of exit nodes
    V_total   = total node count
    C_min_cut = minimum edge cut size (edges/min)
    P_total   = sum of capacity of non-exit nodes
    λ(G)      = edge connectivity (nx.edge_connectivity)
    k         = 1 (target fault tolerance)
    """
    n_nodes = G.number_of_nodes()
    n_exits = sum(1 for _, d in G.nodes(data=True) if d.get("type") == "exit")

    if n_nodes == 0:
        return {
            "score": 0.0, "grade": "F",
            "factors": {
                "exit_coverage": 0.0,
                "min_cut_factor": 0.0,
                "edge_connectivity_ratio": 0.0,
            },
            "details": {},
        }

    k = 1

    # Factor 1: exit coverage — ratio of exits relative to building size
    exit_coverage = min(1.0, n_exits / (n_nodes / 5)) if n_nodes > 0 else 0.0

    # Factor 2: min-cut capacity relative to building population
    min_cut_size = 0
    try:
        if nx.is_connected(G) and G.number_of_edges() > 0:
            min_cut_size = len(nx.minimum_edge_cut(G))
    except Exception:
        pass

    p_total = sum(
        d.get("capacity", 0)
        for _, d in G.nodes(data=True)
        if d.get("type") != "exit"
    )
    min_cut_factor = min(1.0, min_cut_size / (p_total / 10)) if p_total > 0 else 0.0

    # Factor 3: edge connectivity normalised by target fault tolerance
    try:
        edge_conn = nx.edge_connectivity(G)
    except Exception:
        edge_conn = 0
    edge_connectivity_ratio = edge_conn / (k + 1)

    score = round(
        exit_coverage           * 40 +
        min_cut_factor          * 30 +
        edge_connectivity_ratio * 30,
        1,
    )

    grade = (
        "A" if score >= 80 else
        "B" if score >= 65 else
        "C" if score >= 50 else
        "D" if score >= 35 else
        "F"
    )

    return {
        "score": score,
        "grade": grade,
        "factors": {
            "exit_coverage":            round(exit_coverage, 4),
            "min_cut_factor":           round(min_cut_factor, 4),
            "edge_connectivity_ratio":  round(edge_connectivity_ratio, 4),
        },
        "details": {
            "n_nodes":           n_nodes,
            "n_exits":           n_exits,
            "p_total":           p_total,
            "min_cut_size":      min_cut_size,
            "edge_connectivity": edge_conn,
        },
    }


# ---------------------------------------------------------------------------
# 4. Max-flow multi-exit distribution
# ---------------------------------------------------------------------------

def compute_maxflow_distribution(
    G: nx.Graph,
    occupied_rooms: list[str],
    exits: list[str],
) -> dict:
    """
    Distribute evacuees across exits using max-flow (Ford-Fulkerson / NetworkX).

    Model:
      SOURCE → occupied rooms  (capacity = room capacity)
      room edges               (capacity ∝ corridor width: width_m * 10 persons)
      exits → SINK             (capacity = exit capacity)

    Returns:
        {
            total_flow:             int,
            flow_per_exit:          {exit_id: persons},
            bottleneck_edges:       [(u, v, flow, capacity), ...],
            recommended_assignment: {exit_id: persons},
        }
    """
    SOURCE = "__SOURCE__"
    SINK   = "__SINK__"

    # Build directed capacity graph
    H = nx.DiGraph()

    # SOURCE → each occupied room
    for room in occupied_rooms:
        if room in G:
            cap = G.nodes[room].get("capacity", 20)
            H.add_edge(SOURCE, room, capacity=cap)

    # All building edges (bidirectional)
    for u, v, data in G.edges(data=True):
        if data.get("weight", 0) == float("inf"):
            continue  # skip smoke-blocked edges
        # flow capacity ≈ corridor width × 10 (persons per crossing period)
        cap = max(1, int(data.get("width", 2.0) * 10))
        H.add_edge(u, v, capacity=cap)
        H.add_edge(v, u, capacity=cap)

    # Each exit → SINK
    for exit_node in exits:
        if exit_node in G:
            cap = G.nodes[exit_node].get("capacity", 100)
            H.add_edge(exit_node, SINK, capacity=cap)

    if not exits or not occupied_rooms:
        return {
            "total_flow": 0,
            "flow_per_exit": {},
            "bottleneck_edges": [],
            "recommended_assignment": {},
        }

    try:
        flow_value, flow_dict = nx.maximum_flow(H, SOURCE, SINK)
    except nx.NetworkXError:
        flow_value, flow_dict = 0, {}

    flow_per_exit = {}
    for ex in exits:
        flow_per_exit[ex] = int(flow_dict.get(ex, {}).get(SINK, 0))

    # Find bottleneck edges (utilisation >= 90%)
    bottleneck_edges = []
    for u in flow_dict:
        for v, flow in flow_dict[u].items():
            if u in (SOURCE, SINK) or v in (SOURCE, SINK):
                continue
            if H.has_edge(u, v):
                cap = H[u][v]["capacity"]
                if cap > 0 and (flow / cap) >= 0.9:
                    bottleneck_edges.append({
                        "u": u, "v": v,
                        "flow": int(flow),
                        "capacity": cap,
                        "utilisation": round(flow / cap, 3),
                    })

    return {
        "total_flow":            int(flow_value),
        "flow_per_exit":         flow_per_exit,
        "bottleneck_edges":      bottleneck_edges,
        "recommended_assignment": flow_per_exit,  # same data, clearer name
    }


# ---------------------------------------------------------------------------
# 5. Automated experiment runner
# ---------------------------------------------------------------------------

def run_experiments(
    G: nx.Graph,
    exits: list[str],
    fire_location: str,
) -> dict:
    """
    Run 3 standardised evacuation scenarios with both algorithms.

    Scenarios:
      1. Normal       — no modifications
      2. Exit blocked — remove the first available exit
      3. High crowd   — all room edges at 80% crowd density

    For each scenario × algorithm:
      - avg evacuation time (seconds)
      - total nodes visited across all exit searches
      - shortest path length (hops) to best exit
      - execution time (ms)

    Returns structured JSON + a CSV string.
    """
    if fire_location not in G:
        raise ValueError(f"fire_location '{fire_location}' not in graph")

    scenarios = []

    # Scenario 1: Normal
    scenarios.append(("Normal", G.copy()))

    # Scenario 2: Block first exit
    blocked_exit = exits[0] if exits else None
    G2 = G.copy()
    if blocked_exit and blocked_exit in G2:
        G2.remove_node(blocked_exit)
    exits2 = [e for e in exits if e in G2]
    scenarios.append((f"Exit blocked ({blocked_exit})", G2))

    # Scenario 3: All rooms at 80% crowd density
    from graph_builder import calculate_edge_weight
    G3 = G.copy()
    for u, v, data in G3.edges(data=True):
        u_type = G3.nodes[u].get("type", "")
        v_type = G3.nodes[v].get("type", "")
        if u_type == "room" or v_type == "room":
            new_w = calculate_edge_weight(
                data.get("distance", 10),
                0.8,
                data.get("smoke_level", 0.0),
                data.get("is_stair", False),
            )
            G3[u][v]["weight"] = new_w
    scenarios.append(("Rooms at 80% capacity", G3))

    results = []
    for scenario_name, Gs in scenarios:
        s_exits = [e for e in exits if e in Gs]
        if fire_location not in Gs:
            for algo in ("dijkstra", "astar"):
                results.append({
                    "scenario":        scenario_name,
                    "algorithm":       algo,
                    "avg_time_s":      None,
                    "nodes_visited":   0,
                    "best_path_hops":  None,
                    "exec_time_ms":    0.0,
                })
            continue

        for algo in ("dijkstra", "astar"):
            t0 = time.perf_counter()
            routes = find_all_exit_routes(Gs, fire_location, s_exits, algo)
            exec_ms = round((time.perf_counter() - t0) * 1000, 3)

            reachable = [r for r in routes if r["reachable"]]
            avg_time = (
                round(sum(r["cost_seconds"] for r in reachable) / len(reachable), 2)
                if reachable else None
            )
            total_nodes = sum(r["nodes_visited"] for r in routes)
            best_hops = (
                len(reachable[0]["path"]) - 1
                if reachable and reachable[0]["path"] else None
            )

            results.append({
                "scenario":       scenario_name,
                "algorithm":      algo,
                "avg_time_s":     avg_time,
                "nodes_visited":  total_nodes,
                "best_path_hops": best_hops,
                "exec_time_ms":   exec_ms,
            })

    # Generate CSV
    fieldnames = ["scenario", "algorithm", "avg_time_s",
                  "nodes_visited", "best_path_hops", "exec_time_ms"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(results)
    csv_string = buf.getvalue()

    return {
        "fire_location": fire_location,
        "results":       results,
        "csv":           csv_string,
    }
