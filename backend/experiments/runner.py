"""
Experiment runner — orchestrates a parameter sweep.

A `SweepRequest` describes:
  - which `variable` to vary
  - a list of `values` for that variable
  - which `algorithms` to compare
  - how many `repeats` per (value, algorithm) cell
  - a `seed` for reproducibility

Run produces a `SweepResult` with one `TrialMetric` per cell × repeat, plus
a summary dict that the API + CSV exporter can use.
"""

from __future__ import annotations

import copy
import random
from dataclasses import asdict, dataclass

import networkx as nx
from pydantic import BaseModel, Field

from smoke_propagation import compute_smoke_levels

from . import scenarios
from .metrics import TrialMetric, run_trial
from .reporter import to_csv

# Variables whose scenario factory scales the per-edge `smoke_level` field.
# The base graph from the DB carries no smoke field, so run_sweep seeds one
# from the fire source first — otherwise these sweeps scale 0 and every
# value produces identical results.
_SMOKE_SCALED_VARIABLES = {"wind_speed", "fire_severity"}


class SweepRequest(BaseModel):
    fire_location: str = Field(..., min_length=1, max_length=64)
    variable: str = Field(..., max_length=32)
    values: list[float] = Field(..., min_length=1, max_length=100)
    algorithms: list[str] = Field(default=["dijkstra", "astar"], max_length=4)
    repeats: int = Field(default=3, ge=1, le=50)
    seed: int = Field(default=42, ge=0)
    fire_locations: list[str] | None = Field(default=None, max_length=100)
    # Fixed wind direction for the seeded smoke field — a constant (not live
    # weather) keeps sweeps reproducible for a given request.
    wind_direction_deg: float = Field(default=135.0, ge=0.0, lt=360.0)


@dataclass
class SweepResult:
    request: dict
    trials: list[dict]  # serialized TrialMetric rows
    summary: dict  # per (variable_value, algorithm) summary
    csv: str  # CSV export of trials

    def to_dict(self) -> dict:
        return asdict(self)


def _summarize(trials: list[TrialMetric]) -> dict:
    """Group trials by (value, algorithm), report mean / min / max avg_time."""
    buckets: dict[tuple, list[TrialMetric]] = {}
    for t in trials:
        buckets.setdefault((t.value, t.algorithm), []).append(t)
    summary = []
    for (value, algo), group in sorted(buckets.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        times = [g.avg_time_s for g in group if g.avg_time_s is not None]
        summary.append(
            {
                "value": value,
                "algorithm": algo,
                "n": len(group),
                "mean_avg_time_s": round(sum(times) / len(times), 2) if times else None,
                "min_avg_time_s": round(min(times), 2) if times else None,
                "max_avg_time_s": round(max(times), 2) if times else None,
                "mean_exec_ms": round(sum(g.exec_time_ms for g in group) / len(group), 3),
            }
        )
    return {"per_cell": summary}


def run_sweep(
    G: nx.Graph,
    exits: list[str],
    req: SweepRequest,
) -> SweepResult:
    if req.variable not in scenarios.REGISTRY:
        raise ValueError(f"Unknown variable {req.variable}")

    if req.variable in _SMOKE_SCALED_VARIABLES and req.fire_location in G:
        # Seed the base smoke field (severity 1.0) from the fire source so
        # the wind/severity factories scale a real signal. Weights are
        # recomputed per trial by the factory, so only `smoke_level` is set.
        G = copy.deepcopy(G)
        levels = compute_smoke_levels(
            req.fire_location,
            G,
            req.wind_direction_deg,
            wind_speed_ms=0.0,
        )
        for (u, v), s in levels.items():
            if G.has_edge(u, v):
                G[u][v]["smoke_level"] = s

    rng = random.Random(req.seed)
    factory = scenarios.get(req.variable)

    trials: list[TrialMetric] = []
    for value in req.values:
        for algo in req.algorithms:
            for repeat in range(req.repeats):
                # `fire_location` sweep substitutes the source per trial;
                # all other sweeps keep the same source.
                if req.variable == "fire_location" and req.fire_locations:
                    idx = int(value) % len(req.fire_locations)
                    fire = req.fire_locations[idx]
                else:
                    fire = req.fire_location

                Gv = factory(G, value, rng)
                trials.append(
                    run_trial(
                        Gv,
                        fire,
                        exits,
                        algo,
                        variable=req.variable,
                        value=value,
                        repeat=repeat,
                    )
                )

    return SweepResult(
        request=req.model_dump(),
        trials=[t.to_dict() for t in trials],
        summary=_summarize(trials),
        csv=to_csv(trials),
    )
