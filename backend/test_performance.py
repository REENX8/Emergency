"""Performance guardrails on a large synthetic building.

A grid building near the import cap (50×40 = 2000 nodes, ~3900 edges) must
stay comfortably interactive: graph build + full evacuation route search
well under a second each. These bounds are loose (CI machines vary) but
catch accidental O(V²) regressions in the hot paths.
"""

import time

import networkx as nx

from graph_builder import calculate_edge_weight
from pathfinding import compare_algorithms, find_all_exit_routes

ROWS, COLS = 40, 50  # 2000 nodes


def _grid_building() -> tuple[nx.Graph, list[str]]:
    G = nx.Graph()
    for r in range(ROWS):
        for c in range(COLS):
            kind = "corridor" if r % 5 == 0 else "room"
            G.add_node(f"n{r}_{c}", type=kind, x=c * 30, y=r * 30, capacity=10)
    exits = ["n0_0", f"n0_{COLS - 1}", f"n{ROWS - 1}_0", f"n{ROWS - 1}_{COLS - 1}"]
    for e in exits:
        G.nodes[e]["type"] = "exit"
    w = calculate_edge_weight(5, 0.0, 0.0, False)
    for r in range(ROWS):
        for c in range(COLS):
            if c + 1 < COLS:
                G.add_edge(f"n{r}_{c}", f"n{r}_{c + 1}", weight=w, distance=5, is_stair=False)
            if r + 1 < ROWS:
                G.add_edge(f"n{r}_{c}", f"n{r + 1}_{c}", weight=w, distance=5, is_stair=False)
    return G, exits


def test_route_search_2000_nodes_under_a_second():
    G, exits = _grid_building()
    source = f"n{ROWS // 2}_{COLS // 2}"  # centre — worst case for exits at corners

    t0 = time.perf_counter()
    routes = find_all_exit_routes(G, source, exits, "dijkstra")
    dijkstra_s = time.perf_counter() - t0

    t0 = time.perf_counter()
    routes_astar = find_all_exit_routes(G, source, exits, "astar")
    astar_s = time.perf_counter() - t0

    assert all(r["reachable"] for r in routes)
    assert dijkstra_s < 1.0, f"dijkstra took {dijkstra_s:.2f}s on 2000 nodes"
    assert astar_s < 1.0, f"astar took {astar_s:.2f}s on 2000 nodes"
    # Same optimal costs on the big graph too.
    for dr, ar in zip(routes, routes_astar, strict=True):
        assert dr["cost_seconds"] == ar["cost_seconds"]


def test_compare_algorithms_reports_astar_advantage():
    """A* should settle no more nodes than Dijkstra on a spatial grid."""
    G, exits = _grid_building()
    source = f"n{ROWS // 2}_{COLS // 2}"
    result = compare_algorithms(G, source, exits)
    assert result["nodes_visited"]["astar"] <= result["nodes_visited"]["dijkstra"]
