"""
schemas.py — Pydantic request / response schemas
"""

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Pagination envelope (used by list_*) — generic over the item type.
# ---------------------------------------------------------------------------

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


# Standard size caps — strings used widely, lists for batch endpoints.
SHORT_STR = Field(max_length=200)
MEDIUM_STR = Field(default="", max_length=500)
NODE_KEY = Field(min_length=1, max_length=64)


# ---------------------------------------------------------------------------
# Building
# ---------------------------------------------------------------------------


class BuildingCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    address: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=1000)
    tmd_station_id: str = Field(
        default="515201",
        max_length=20,
        description="TMD weather station ID for wind data (default: Bangna, Bangkok)",
    )
    has_sprinkler: bool = False
    building_type: str = Field(default="office", max_length=20)
    total_floors: int = Field(default=1, ge=1, le=200)


class BuildingUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=1000)
    tmd_station_id: str | None = Field(default=None, max_length=20)
    has_sprinkler: bool | None = None
    building_type: str | None = Field(default=None, max_length=20)
    total_floors: int | None = Field(default=None, ge=1, le=200)


class BuildingResponse(BaseModel):
    id: int
    name: str
    address: str
    description: str
    tmd_station_id: str
    has_sprinkler: bool
    building_type: str
    total_floors: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Floor
# ---------------------------------------------------------------------------


class FloorResponse(BaseModel):
    id: int
    building_id: int
    floor_number: int
    image_filename: str
    image_width_px: int
    image_height_px: int
    scale_px_per_m: float

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------


class NodeCreate(BaseModel):
    node_key: str = Field(
        ..., min_length=1, max_length=64, description="Unique ID within this building, e.g. 'r101'"
    )
    type: str = Field(default="room", max_length=20, description="room / corridor / stair / exit")
    label: str = Field(default="", max_length=200)
    x: float = 0.0
    y: float = 0.0
    capacity: int = Field(default=20, ge=0, le=100000)
    floor_number: int = Field(default=1, ge=-50, le=200)
    area_m2: float | None = Field(default=None, ge=0, le=100000)


class NodeUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=200)
    x: float | None = None
    y: float | None = None
    capacity: int | None = Field(default=None, ge=0, le=100000)
    type: str | None = Field(default=None, max_length=20)
    area_m2: float | None = Field(default=None, ge=0, le=100000)


class NodeResponse(BaseModel):
    id: int
    building_id: int
    node_key: str
    type: str
    label: str
    x: float
    y: float
    capacity: int
    floor_number: int
    area_m2: float | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Edge
# ---------------------------------------------------------------------------


class EdgeCreate(BaseModel):
    u_key: str = Field(..., min_length=1, max_length=64)
    v_key: str = Field(..., min_length=1, max_length=64)
    distance_m: float = Field(default=10.0, gt=0, le=10000)
    width_m: float = Field(default=2.0, gt=0, le=100)
    is_stair: bool = False


class EdgeResponse(BaseModel):
    id: int
    building_id: int
    u_key: str
    v_key: str
    distance_m: float
    width_m: float
    is_stair: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Incident
# ---------------------------------------------------------------------------


class IncidentCreate(BaseModel):
    node_key: str = Field(..., min_length=1, max_length=64)
    incident_type: str = Field(..., max_length=20, description="fire / smoke / crowd")
    severity: float = Field(default=0.5, ge=0.0, le=1.0)


class IncidentResponse(BaseModel):
    id: int
    building_id: int
    node_key: str
    incident_type: str
    severity: float
    reported_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Building JSON import
# ---------------------------------------------------------------------------


class BuildingImportPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    address: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=1000)
    tmd_station_id: str = Field(default="515201", max_length=20)
    has_sprinkler: bool = False
    building_type: str = Field(default="office", max_length=20)
    total_floors: int = Field(default=1, ge=1, le=200)
    nodes: list[NodeCreate] = Field(default_factory=list, max_length=5000)
    edges: list[EdgeCreate] = Field(default_factory=list, max_length=20000)


class BuildingImportResponse(BuildingResponse):
    nodes_created: int
    edges_created: int


# ---------------------------------------------------------------------------
# Graph (for frontend Cytoscape.js)
# ---------------------------------------------------------------------------


class GraphResponse(BaseModel):
    nodes: list[dict]
    edges: list[dict]
    floors: list[FloorResponse]
