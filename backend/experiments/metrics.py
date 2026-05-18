"""
Metric collection for experiment trials.

A single trial = one (variable value × algorithm × repeat) run. We record:
  - avg evacuation time across reachable exits
  - p50 / p95 evacuation time
  - total nodes visited (algorithm cost proxy)
  - best path hops (shortest reachable path length)
  - exec time in ms
  - reachable exits count
"""

from __future__ import annotations

import time
from dataclasses import dataclass, asdict
from statistics import median
from typing import Optional

import networkx as nx

from pathfinding import find_all_exit_routes


@dataclass
class TrialMetric:
    variable:        str
    value:           float
    algorithm:       str
    repeat:          int
    avg_time_s:      Optional[float]
    p50_time_s:      Optional[float]
    p95_time_s:      Optional[float]
    nodes_visited:   int
    best_path_hops:  Optional[int]
    exec_time_ms:    float
    reachable_exits: int

    def to_dict(self) -> dict:
        return asdict(self)


def _percentile(values: list[float], pct: float) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return round(s[0], 2)
    idx = max(0, min(len(s) - 1, int(round((pct / 100.0) * (len(s) - 1)))))
    return round(s[idx], 2)


def run_trial(
    G: nx.Graph,
    fire_location: str,
    exits: list[str],
    algorithm: str,
    variable: str,
    value: float,
    repeat: int,
) -> TrialMetric:
    """Run one trial — pathfinder + metric collection. Pure."""
    if fire_location not in G:
        return TrialMetric(
            variable=variable, value=value, algorithm=algorithm, repeat=repeat,
            avg_time_s=None, p50_time_s=None, p95_time_s=None,
            nodes_visited=0, best_path_hops=None, exec_time_ms=0.0,
            reachable_exits=0,
        )

    s_exits = [e for e in exits if e in G]
    t0 = time.perf_counter()
    routes = find_all_exit_routes(G, fire_location, s_exits, algorithm)
    exec_ms = round((time.perf_counter() - t0) * 1000.0, 3)

    reachable = [r for r in routes if r["reachable"]]
    times = [float(r["cost_seconds"]) for r in reachable]
    avg = round(sum(times) / len(times), 2) if times else None
    total_nodes = sum(int(r["nodes_visited"]) for r in routes)
    best_hops = (
        len(reachable[0]["path"]) - 1
        if reachable and reachable[0].get("path") else None
    )

    return TrialMetric(
        variable=variable, value=value, algorithm=algorithm, repeat=repeat,
        avg_time_s=avg,
        p50_time_s=round(median(times), 2) if times else None,
        p95_time_s=_percentile(times, 95),
        nodes_visited=total_nodes,
        best_path_hops=best_hops,
        exec_time_ms=exec_ms,
        reachable_exits=len(reachable),
    )
