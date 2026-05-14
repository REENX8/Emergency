"""
routers/buildings.py — Building CRUD, floor image upload, node/edge management, and evacuation.
"""

import copy
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from dynamic_graph import build_graph_from_db, get_exits_from_db, graph_to_cytoscape
from models import Building, Edge, Floor, Node
from pathfinding import compare_algorithms, estimate_evacuation_time, find_all_exit_routes
from schemas import (
    BuildingCreate, BuildingResponse,
    EdgeCreate, EdgeResponse,
    FloorResponse,
    GraphResponse,
    NodeCreate, NodeResponse, NodeUpdate,
)
from weather import compute_smoke_spread, fetch_weather

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/buildings", tags=["buildings"])


# ---------------------------------------------------------------------------
# Building CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=BuildingResponse, status_code=201)
def create_building(payload: BuildingCreate, db: Session = Depends(get_db)):
    building = Building(**payload.model_dump())
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


@router.get("", response_model=list[BuildingResponse])
def list_buildings(db: Session = Depends(get_db)):
    return db.query(Building).order_by(Building.created_at.desc()).all()


@router.get("/{building_id}", response_model=BuildingResponse)
def get_building(building_id: int, db: Session = Depends(get_db)):
    b = db.get(Building, building_id)
    if not b:
        raise HTTPException(404, detail="Building not found")
    return b


@router.delete("/{building_id}", status_code=204)
def delete_building(building_id: int, db: Session = Depends(get_db)):
    b = db.get(Building, building_id)
    if not b:
        raise HTTPException(404, detail="Building not found")
    db.delete(b)
    db.commit()


# ---------------------------------------------------------------------------
# Floor image upload
# ---------------------------------------------------------------------------

@router.post("/{building_id}/floors", response_model=FloorResponse, status_code=201)
async def upload_floor(
    building_id:   int,
    floor_number:  int         = Form(...),
    scale_px_per_m: float      = Form(default=6.0),
    image:         UploadFile  = File(...),
    db:            Session     = Depends(get_db),
):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")

    # Accept PNG, JPG, PDF only
    allowed = {"image/png", "image/jpeg", "application/pdf"}
    if image.content_type not in allowed:
        raise HTTPException(400, detail=f"Unsupported file type: {image.content_type}")

    ext = image.filename.rsplit(".", 1)[-1].lower() if "." in image.filename else "png"
    filename = f"b{building_id}_f{floor_number}_{uuid.uuid4().hex[:8]}.{ext}"
    dest = os.path.join(UPLOAD_DIR, filename)

    content = await image.read()
    with open(dest, "wb") as f:
        f.write(content)

    # Try to read image dimensions (PNG/JPG only)
    width_px, height_px = 0, 0
    if ext in ("png", "jpg", "jpeg"):
        try:
            import struct
            if ext == "png":
                width_px  = struct.unpack(">I", content[16:20])[0]
                height_px = struct.unpack(">I", content[20:24])[0]
            # JPEG dimension parsing is complex — leave as 0 for now
        except Exception:
            pass

    # Upsert: replace existing floor record if same building + floor_number
    existing = (
        db.query(Floor)
        .filter(Floor.building_id == building_id, Floor.floor_number == floor_number)
        .first()
    )
    if existing:
        old_path = os.path.join(UPLOAD_DIR, existing.image_filename)
        if os.path.exists(old_path):
            os.remove(old_path)
        existing.image_filename  = filename
        existing.image_width_px  = width_px
        existing.image_height_px = height_px
        existing.scale_px_per_m  = scale_px_per_m
        db.commit()
        db.refresh(existing)
        return existing

    floor = Floor(
        building_id     = building_id,
        floor_number    = floor_number,
        image_filename  = filename,
        image_width_px  = width_px,
        image_height_px = height_px,
        scale_px_per_m  = scale_px_per_m,
    )
    db.add(floor)
    db.commit()
    db.refresh(floor)
    return floor


@router.get("/{building_id}/floors", response_model=list[FloorResponse])
def list_floors(building_id: int, db: Session = Depends(get_db)):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")
    return db.query(Floor).filter(Floor.building_id == building_id).order_by(Floor.floor_number).all()


# ---------------------------------------------------------------------------
# Node management
# ---------------------------------------------------------------------------

@router.post("/{building_id}/nodes", response_model=NodeResponse, status_code=201)
def create_node(building_id: int, payload: NodeCreate, db: Session = Depends(get_db)):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")

    # node_key must be unique within the building
    existing = (
        db.query(Node)
        .filter(Node.building_id == building_id, Node.node_key == payload.node_key)
        .first()
    )
    if existing:
        raise HTTPException(409, detail=f"Node key '{payload.node_key}' already exists in this building")

    node = Node(building_id=building_id, **payload.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.get("/{building_id}/nodes", response_model=list[NodeResponse])
def list_nodes(building_id: int, db: Session = Depends(get_db)):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")
    return db.query(Node).filter(Node.building_id == building_id).all()


@router.put("/{building_id}/nodes/{node_key}", response_model=NodeResponse)
def update_node(building_id: int, node_key: str, payload: NodeUpdate, db: Session = Depends(get_db)):
    node = (
        db.query(Node)
        .filter(Node.building_id == building_id, Node.node_key == node_key)
        .first()
    )
    if not node:
        raise HTTPException(404, detail="Node not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(node, field, value)
    db.commit()
    db.refresh(node)
    return node


@router.delete("/{building_id}/nodes/{node_key}", status_code=204)
def delete_node(building_id: int, node_key: str, db: Session = Depends(get_db)):
    node = (
        db.query(Node)
        .filter(Node.building_id == building_id, Node.node_key == node_key)
        .first()
    )
    if not node:
        raise HTTPException(404, detail="Node not found")
    # Delete adjacent edges too
    db.query(Edge).filter(
        Edge.building_id == building_id,
        (Edge.u_key == node_key) | (Edge.v_key == node_key)
    ).delete(synchronize_session=False)
    db.delete(node)
    db.commit()


# ---------------------------------------------------------------------------
# Edge management
# ---------------------------------------------------------------------------

@router.post("/{building_id}/edges", response_model=EdgeResponse, status_code=201)
def create_edge(building_id: int, payload: EdgeCreate, db: Session = Depends(get_db)):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")

    # Validate both nodes exist
    for key in (payload.u_key, payload.v_key):
        if not db.query(Node).filter(Node.building_id == building_id, Node.node_key == key).first():
            raise HTTPException(400, detail=f"Node '{key}' does not exist in this building")

    # Prevent duplicate edges
    dup = db.query(Edge).filter(
        Edge.building_id == building_id,
        ((Edge.u_key == payload.u_key) & (Edge.v_key == payload.v_key)) |
        ((Edge.u_key == payload.v_key) & (Edge.v_key == payload.u_key))
    ).first()
    if dup:
        raise HTTPException(409, detail="Edge already exists between these two nodes")

    edge = Edge(building_id=building_id, **payload.model_dump())
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


@router.get("/{building_id}/edges", response_model=list[EdgeResponse])
def list_edges(building_id: int, db: Session = Depends(get_db)):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")
    return db.query(Edge).filter(Edge.building_id == building_id).all()


@router.delete("/{building_id}/edges/{edge_id}", status_code=204)
def delete_edge(building_id: int, edge_id: int, db: Session = Depends(get_db)):
    edge = db.query(Edge).filter(Edge.id == edge_id, Edge.building_id == building_id).first()
    if not edge:
        raise HTTPException(404, detail="Edge not found")
    db.delete(edge)
    db.commit()


# ---------------------------------------------------------------------------
# Graph snapshot (for Cytoscape.js rendering)
# ---------------------------------------------------------------------------

@router.get("/{building_id}/graph", response_model=GraphResponse)
def get_graph(building_id: int, db: Session = Depends(get_db)):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")
    G = build_graph_from_db(building_id, db)
    cy = graph_to_cytoscape(G)
    floors = db.query(Floor).filter(Floor.building_id == building_id).order_by(Floor.floor_number).all()
    return GraphResponse(nodes=cy["nodes"], edges=cy["edges"], floors=floors)


# ---------------------------------------------------------------------------
# Evacuation simulation
# ---------------------------------------------------------------------------

class EvacuateBuildingRequest:
    pass


from pydantic import BaseModel, Field as PField

class CrowdDensityItem(BaseModel):
    node_key: str
    density:  float = PField(ge=0.0, le=1.0)


class EvacuateBuildingRequest(BaseModel):
    fire_location:      str
    blocked_exits:      list[str]              = []
    crowd_densities:    list[CrowdDensityItem] = []
    use_weather_wind:   bool                   = True
    manual_wind_direction: Optional[float]     = None
    manual_wind_speed:     Optional[float]     = None
    algorithm:          str                    = "dijkstra"
    compare_algorithms: bool                   = True
    occupied_rooms:     list[str]              = []


@router.post("/{building_id}/evacuate")
async def evacuate_building(
    building_id: int,
    req: EvacuateBuildingRequest,
    db: Session = Depends(get_db),
):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")

    crowd_map = {cd.node_key: cd.density for cd in req.crowd_densities}
    G = build_graph_from_db(building_id, db, crowd_densities=crowd_map)

    # Validate inputs
    all_nodes = set(G.nodes())
    if req.fire_location not in all_nodes:
        raise HTTPException(400, detail=f"fire_location '{req.fire_location}' not in building graph")
    for n in req.blocked_exits + req.occupied_rooms:
        if n and n not in all_nodes:
            raise HTTPException(400, detail=f"Node '{n}' not found in building graph")

    # Weather / wind
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

    # Smoke spread
    all_nodes_data = dict(G.nodes(data=True))
    smoke_edges = compute_smoke_spread(
        fire_node=req.fire_location,
        graph_nodes=all_nodes_data,
        graph_edges=list(G.edges()),
        wind_direction_deg=weather["wind_direction_deg"],
        wind_speed_ms=weather["wind_speed_ms"],
        smoke_radius_m=20.0,
    )

    # Apply conditions to a working copy
    G_sim = copy.deepcopy(G)
    from graph_builder import apply_smoke, remove_node_safe
    apply_smoke(G_sim, smoke_edges)

    removed_exits = []
    for exit_node in req.blocked_exits:
        if remove_node_safe(G_sim, exit_node):
            removed_exits.append(exit_node)

    exits = get_exits_from_db(building_id, db)
    exits = [e for e in exits if e in G_sim]
    if not exits:
        raise HTTPException(400, detail="All exits are blocked — evacuation impossible.")

    primary_routes = find_all_exit_routes(G_sim, req.fire_location, exits, req.algorithm)

    comparison = None
    if req.compare_algorithms:
        comparison = compare_algorithms(G_sim, req.fire_location, exits)

    evac_estimate = None
    if req.occupied_rooms:
        evac_estimate = estimate_evacuation_time(G_sim, req.occupied_rooms, exits, req.algorithm)

    cy = graph_to_cytoscape(G_sim)
    floors = db.query(Floor).filter(Floor.building_id == building_id).order_by(Floor.floor_number).all()

    return {
        "fire_location":       req.fire_location,
        "primary_routes":      primary_routes,
        "comparison":          comparison,
        "smoke_blocked_edges": [[u, v] for u, v in smoke_edges],
        "removed_exits":       removed_exits,
        "weather":             weather,
        "evacuation_estimate": evac_estimate,
        "graph_state":         cy,
        "floors": [
            {
                "floor_number":   f.floor_number,
                "image_filename": f.image_filename,
                "image_width_px": f.image_width_px,
                "image_height_px": f.image_height_px,
                "scale_px_per_m": f.scale_px_per_m,
            }
            for f in floors
        ],
    }
