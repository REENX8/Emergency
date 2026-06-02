"""
routers/analysis.py — Graph analysis endpoints:
  POST /buildings/{id}/analysis/connectivity
  POST /buildings/{id}/analysis/bottleneck
  GET  /buildings/{id}/analysis/safety
  GET  /buildings/{id}/experiments/run
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from analysis import (
    check_connectivity,
    compute_maxflow_distribution,
    compute_safety_score,
    find_bottlenecks,
    run_experiments,
)
from compliance import BuildingMeta, evaluate as evaluate_compliance
from database import get_db
from dynamic_graph import build_graph_from_db, get_exits_from_db
from experiments import SweepRequest, run_sweep
from models import Building

router = APIRouter(prefix="/buildings", tags=["analysis"])


def _get_building_or_404(building_id: int, db: Session) -> Building:
    b = db.get(Building, building_id)
    if not b:
        raise HTTPException(404, detail="Building not found")
    return b


# ---------------------------------------------------------------------------
# Connectivity
# ---------------------------------------------------------------------------

class ConnectivityRequest(BaseModel):
    blocked_edges: list[list[str]] = []   # [[u, v], ...]


@router.post("/{building_id}/analysis/connectivity")
def connectivity_check(
    building_id: int,
    req: ConnectivityRequest,
    db: Session = Depends(get_db),
):
    _get_building_or_404(building_id, db)
    G = build_graph_from_db(building_id, db)
    blocked = [tuple(e) for e in req.blocked_edges]
    return check_connectivity(G, blocked_edges=blocked)


# ---------------------------------------------------------------------------
# Bottleneck
# ---------------------------------------------------------------------------

@router.post("/{building_id}/analysis/bottleneck")
def bottleneck_analysis(
    building_id: int,
    db: Session = Depends(get_db),
):
    _get_building_or_404(building_id, db)
    G = build_graph_from_db(building_id, db)
    return find_bottlenecks(G)


# ---------------------------------------------------------------------------
# Safety score
# ---------------------------------------------------------------------------

@router.get("/{building_id}/analysis/safety")
def safety_score(
    building_id: int,
    db: Session = Depends(get_db),
):
    _get_building_or_404(building_id, db)
    G = build_graph_from_db(building_id, db)
    return compute_safety_score(G)


# ---------------------------------------------------------------------------
# Max-flow distribution
# ---------------------------------------------------------------------------

class MaxflowRequest(BaseModel):
    occupied_rooms: list[str] = []


@router.post("/{building_id}/evacuate/maxflow")
def maxflow_distribution(
    building_id: int,
    req: MaxflowRequest,
    db: Session = Depends(get_db),
):
    _get_building_or_404(building_id, db)
    G     = build_graph_from_db(building_id, db)
    exits = get_exits_from_db(building_id, db)

    if not exits:
        raise HTTPException(400, detail="No exits defined in this building")

    valid_rooms = [r for r in req.occupied_rooms if r in G]
    return compute_maxflow_distribution(G, valid_rooms, exits)


# ---------------------------------------------------------------------------
# Thai building code compliance
# ---------------------------------------------------------------------------

@router.get("/{building_id}/compliance")
def building_compliance(
    building_id: int,
    db: Session = Depends(get_db),
):
    """Evaluate the building against Thai building code (กฎกระทรวง พ.ศ. 2535).

    See backend/compliance.py for the full rule list + thresholds. Building
    metadata (`has_sprinkler`, `building_type`, `total_floors`) controls
    which threshold applies — update via PATCH /buildings/{id}.
    """
    b = _get_building_or_404(building_id, db)
    G = build_graph_from_db(building_id, db)
    meta = BuildingMeta(
        has_sprinkler = bool(b.has_sprinkler),
        building_type = b.building_type or "office",
        total_floors  = int(b.total_floors or 1),
    )
    return evaluate_compliance(G, meta)


# ---------------------------------------------------------------------------
# Experiment runner + CSV export
# ---------------------------------------------------------------------------

@router.get("/{building_id}/experiments/run")
def run_building_experiments(
    building_id: int,
    fire_location: str = Query(..., description="Node key where fire starts"),
    format: str = Query(default="json", description="Response format: json | csv"),
    db: Session = Depends(get_db),
):
    _get_building_or_404(building_id, db)
    G     = build_graph_from_db(building_id, db)
    exits = get_exits_from_db(building_id, db)

    if fire_location not in G:
        raise HTTPException(
            400, detail=f"fire_location '{fire_location}' not in building graph"
        )
    if not exits:
        raise HTTPException(400, detail="No exits defined in this building")

    data = run_experiments(G, exits, fire_location)

    if format == "csv":
        return Response(
            content=data["csv"],
            media_type="text/csv",
            headers={
                "Content-Disposition":
                    f'attachment; filename="experiments_b{building_id}.csv"'
            },
        )

    return data


# ---------------------------------------------------------------------------
# Sensitivity sweep (Phase 4)
# ---------------------------------------------------------------------------

@router.post("/{building_id}/experiments/sweep")
def run_sweep_endpoint(
    building_id: int,
    req: SweepRequest,
    format: str = Query(default="json", description="json | csv"),
    db: Session = Depends(get_db),
):
    """Run an evacuation sweep over one parameter (wind_speed, fire_severity,
    crowd_density, or fire_location). Reproducible given the same `seed`.

    Synchronous — fine for small sweeps (≤ 100 values × ≤ 4 algorithms ×
    ≤ 50 repeats). For larger sweeps move to a background queue.
    """
    _get_building_or_404(building_id, db)
    G     = build_graph_from_db(building_id, db)
    exits = get_exits_from_db(building_id, db)

    if not exits:
        raise HTTPException(400, detail="No exits defined in this building")
    if req.fire_location not in G:
        raise HTTPException(400, detail=f"fire_location '{req.fire_location}' not in graph")
    if req.variable == "fire_location" and req.fire_locations:
        for fl in req.fire_locations:
            if fl not in G:
                raise HTTPException(400, detail=f"fire_locations entry '{fl}' not in graph")

    try:
        result = run_sweep(G, exits, req)
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc))

    if format == "csv":
        return Response(
            content=result.csv,
            media_type="text/csv",
            headers={
                "Content-Disposition":
                    f'attachment; filename="sweep_b{building_id}_{req.variable}.csv"'
            },
        )
    return result.to_dict()
