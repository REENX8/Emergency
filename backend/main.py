"""
main.py — FastAPI server for the Building Evacuation Simulation

Endpoints (legacy, single hardcoded building):
  GET  /building          → full graph (nodes + edges) for Cytoscape.js
  POST /evacuate          → run pathfinding under dynamic conditions
  GET  /weather           → current weather from Thai Met Dept API
  GET  /health            → liveness check

Multi-building endpoints (database-backed):
  /buildings/*            → see routers/buildings.py
  /buildings/{id}/incidents/* → see routers/incidents.py

Run with:
  uvicorn main:app --reload --port 8000
"""

import copy
import logging
import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from database import init_db
from graph_builder import (
    build_evacuation_graph,
    get_exits,
    apply_smoke,
    remove_node_safe,
)
from pathfinding import find_all_exit_routes, compare_algorithms, estimate_evacuation_time
from weather import fetch_weather, compute_smoke_spread
from routers import buildings as buildings_router
from routers import incidents as incidents_router
from routers import analysis as analysis_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Building Evacuation Simulation API",
    description="Graph-based evacuation routing with dynamic fire/smoke/crowd conditions",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded floor plan images
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Include routers
app.include_router(buildings_router.router)
app.include_router(incidents_router.router)
app.include_router(analysis_router.router)

# Initialise database tables on startup
@app.on_event("startup")
def on_startup():
    init_db()


# ---------------------------------------------------------------------------
# Request / Response models (legacy single-building endpoints)
# ---------------------------------------------------------------------------

class CrowdDensity(BaseModel):
    node_id: str
    density: float = Field(ge=0.0, le=1.0, description="Occupancy ratio 0=empty 1=full")


class EvacuateRequest(BaseModel):
    fire_location: str = Field(..., description="Node ID where fire started (e.g. 'r201')")
    blocked_exits: list[str] = Field(
        default_factory=list,
        description="Exit node IDs to remove (broken/blocked exits)",
    )
    crowd_densities: list[CrowdDensity] = Field(
        default_factory=list,
        description="Per-node crowd density overrides",
    )
    use_weather_wind: bool = Field(
        default=True,
        description="Fetch live wind data from TMD API to model smoke spread",
    )
    manual_wind_direction: Optional[float] = Field(
        default=None,
        description="Override wind direction in degrees (0=N, 90=E). Ignored if use_weather_wind=True",
    )
    manual_wind_speed: Optional[float] = Field(
        default=None,
        description="Override wind speed in m/s. Ignored if use_weather_wind=True",
    )
    algorithm: str = Field(
        default="dijkstra",
        description="Primary pathfinding algorithm: 'dijkstra' | 'astar'",
    )
    compare_algorithms: bool = Field(
        default=True,
        description="Also run the other algorithm for comparison table",
    )
    occupied_rooms: list[str] = Field(
        default_factory=list,
        description="Rooms with occupants (for total evacuation time estimate)",
    )


class RouteResult(BaseModel):
    exit: str
    path: list[str]
    cost_seconds: Optional[float]
    reachable: bool
    algorithm: str


class EvacuateResponse(BaseModel):
    fire_location: str
    primary_routes: list[RouteResult]
    comparison: Optional[dict]
    smoke_blocked_edges: list[list[str]]
    removed_exits: list[str]
    weather: dict
    evacuation_estimate: Optional[dict]
    graph_state: dict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _graph_to_cytoscape(G) -> dict:
    """Convert a NetworkX graph to Cytoscape.js elements format."""
    nodes = []
    for node_id, data in G.nodes(data=True):
        nodes.append({
            "data": {
                "id":       node_id,
                "label":    data.get("label", node_id),
                "type":     data.get("type", "room"),
                "floor":    data.get("floor", 1),
                "capacity": data.get("capacity", 0),
            },
            "position": {"x": data.get("x", 0), "y": data.get("y", 0)},
        })

    edges = []
    seen = set()
    for u, v, data in G.edges(data=True):
        key = tuple(sorted([u, v]))
        if key in seen:
            continue
        seen.add(key)
        smoke = data.get("smoke_blocked", False)
        edges.append({
            "data": {
                "id":           f"{u}__{v}",
                "source":       u,
                "target":       v,
                "weight":       round(data.get("weight", 0), 2),
                "distance":     data.get("distance", 0),
                "width":        data.get("width", 0),
                "crowd_density": round(data.get("crowd_density", 0), 2),
                "smoke_blocked": smoke,
                "is_stair":     data.get("is_stair", False),
            }
        })

    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Legacy endpoints (hardcoded 3-floor building)
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "evacuation-simulation"}


@app.get("/building")
def get_building():
    """Return the base building graph (no dynamic conditions applied)."""
    G = build_evacuation_graph()
    return {
        "graph": _graph_to_cytoscape(G),
        "exits": get_exits(G),
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
    }


@app.get("/weather")
async def get_weather():
    """Fetch current weather from the Thai Meteorological Department API."""
    return await fetch_weather()


@app.post("/evacuate", response_model=EvacuateResponse)
async def evacuate(req: EvacuateRequest):
    """
    Run evacuation simulation under dynamic conditions (legacy hardcoded building).
    For DB-backed multi-building, use POST /buildings/{id}/evacuate instead.
    """
    crowd_map = {cd.node_id: cd.density for cd in req.crowd_densities}
    G = build_evacuation_graph(crowd_densities=crowd_map)

    if req.fire_location not in G:
        raise HTTPException(
            status_code=400,
            detail=f"fire_location '{req.fire_location}' is not a valid node. "
                   f"Valid nodes: {list(G.nodes())}",
        )

    all_valid_nodes = set(G.nodes())
    for node in req.blocked_exits:
        if node not in all_valid_nodes:
            raise HTTPException(400, detail=f"blocked_exits: '{node}' is not a valid node.")
    for node in req.occupied_rooms:
        if node not in all_valid_nodes:
            raise HTTPException(400, detail=f"occupied_rooms: '{node}' is not a valid node.")

    if req.use_weather_wind:
        weather = await fetch_weather()
    else:
        weather = {
            "wind_speed_ms":      req.manual_wind_speed or 0.0,
            "wind_direction_deg": req.manual_wind_direction or 0.0,
            "temperature_c":      None,
            "humidity_pct":       None,
            "description":        "Manual override",
            "station":            "manual",
            "source":             "manual",
        }

    all_nodes_data = dict(G.nodes(data=True))
    all_edges = list(G.edges())
    smoke_edges = compute_smoke_spread(
        fire_node=req.fire_location,
        graph_nodes=all_nodes_data,
        graph_edges=all_edges,
        wind_direction_deg=weather["wind_direction_deg"],
        wind_speed_ms=weather["wind_speed_ms"],
        smoke_radius_m=20.0,
    )

    G_sim = copy.deepcopy(G)
    apply_smoke(G_sim, smoke_edges)

    removed_exits = []
    for exit_node in req.blocked_exits:
        if remove_node_safe(G_sim, exit_node):
            removed_exits.append(exit_node)

    exits = get_exits(G_sim)
    if not exits:
        raise HTTPException(status_code=400, detail="All exits are blocked — evacuation impossible.")

    primary_routes = find_all_exit_routes(G_sim, req.fire_location, exits, req.algorithm)

    comparison = None
    if req.compare_algorithms:
        comparison = compare_algorithms(G_sim, req.fire_location, exits)

    evac_estimate = None
    if req.occupied_rooms:
        evac_estimate = estimate_evacuation_time(
            G_sim, req.occupied_rooms, exits, req.algorithm
        )

    smoke_edge_list = [[u, v] for u, v in smoke_edges]

    return EvacuateResponse(
        fire_location=req.fire_location,
        primary_routes=[RouteResult(**r) for r in primary_routes],
        comparison=comparison,
        smoke_blocked_edges=smoke_edge_list,
        removed_exits=removed_exits,
        weather=weather,
        evacuation_estimate=evac_estimate,
        graph_state=_graph_to_cytoscape(G_sim),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
