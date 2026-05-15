"""
schemas.py — Pydantic request / response schemas
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Building
# ---------------------------------------------------------------------------

class BuildingCreate(BaseModel):
    name:           str
    address:        str = ""
    description:    str = ""
    tmd_station_id: str = Field(default="515201", description="TMD weather station ID for wind data (default: Bangna, Bangkok)")


class BuildingResponse(BaseModel):
    id:             int
    name:           str
    address:        str
    description:    str
    tmd_station_id: str
    created_at:     datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Floor
# ---------------------------------------------------------------------------

class FloorResponse(BaseModel):
    id:              int
    building_id:     int
    floor_number:    int
    image_filename:  str
    image_width_px:  int
    image_height_px: int
    scale_px_per_m:  float

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

class NodeCreate(BaseModel):
    node_key:     str  = Field(..., description="Unique ID within this building, e.g. 'r101'")
    type:         str  = Field(default="room", description="room / corridor / stair / exit")
    label:        str  = ""
    x:            float = 0.0
    y:            float = 0.0
    capacity:     int   = 20
    floor_number: int   = 1


class NodeUpdate(BaseModel):
    label:    Optional[str]   = None
    x:        Optional[float] = None
    y:        Optional[float] = None
    capacity: Optional[int]   = None
    type:     Optional[str]   = None


class NodeResponse(BaseModel):
    id:           int
    building_id:  int
    node_key:     str
    type:         str
    label:        str
    x:            float
    y:            float
    capacity:     int
    floor_number: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Edge
# ---------------------------------------------------------------------------

class EdgeCreate(BaseModel):
    u_key:      str
    v_key:      str
    distance_m: float = Field(default=10.0, gt=0)
    width_m:    float = Field(default=2.0, gt=0)
    is_stair:   bool  = False


class EdgeResponse(BaseModel):
    id:          int
    building_id: int
    u_key:       str
    v_key:       str
    distance_m:  float
    width_m:     float
    is_stair:    bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Incident
# ---------------------------------------------------------------------------

class IncidentCreate(BaseModel):
    node_key:      str
    incident_type: str  = Field(..., description="fire / smoke / crowd")
    severity:      float = Field(default=0.5, ge=0.0, le=1.0)


class IncidentResponse(BaseModel):
    id:            int
    building_id:   int
    node_key:      str
    incident_type: str
    severity:      float
    reported_at:   datetime
    is_active:     bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Building JSON import
# ---------------------------------------------------------------------------

class BuildingImportPayload(BaseModel):
    name:           str
    address:        str = ""
    description:    str = ""
    tmd_station_id: str = "515201"
    nodes:          list[NodeCreate] = []
    edges:          list[EdgeCreate] = []


class BuildingImportResponse(BuildingResponse):
    nodes_created: int
    edges_created: int


# ---------------------------------------------------------------------------
# Graph (for frontend Cytoscape.js)
# ---------------------------------------------------------------------------

class GraphResponse(BaseModel):
    nodes:  list[dict]
    edges:  list[dict]
    floors: list[FloorResponse]
