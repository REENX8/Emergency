"""routers/incidents.py — Report and resolve incidents (fire / smoke / crowd)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from audit import audit
from auth import require_role
from database import get_db
from dynamic_graph import invalidate_graph_cache
from models import Building, Incident, Node, User
from rate_limit import limiter
from realtime import broadcast_sync
from schemas import IncidentCreate, IncidentResponse, Page

router = APIRouter(prefix="/buildings", tags=["incidents"])

VALID_TYPES = {"fire", "smoke", "crowd"}


@router.post("/{building_id}/incidents", response_model=IncidentResponse, status_code=201)
@limiter.limit("10/minute")
def report_incident(
    request: Request,
    building_id: int,
    payload: IncidentCreate,
    db: Session = Depends(get_db),
):
    """Anonymous endpoint — the mobile user-app reports incidents without
    needing a login. Rate-limited per-IP to mitigate spam."""
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")

    if payload.incident_type not in VALID_TYPES:
        raise HTTPException(400, detail=f"incident_type must be one of {sorted(VALID_TYPES)}")

    # Validate node exists in this building
    node = (
        db.query(Node)
        .filter(
            Node.building_id == building_id,
            Node.node_key == payload.node_key,
        )
        .first()
    )
    if not node:
        raise HTTPException(
            400, detail=f"Node '{payload.node_key}' not found in building {building_id}"
        )

    incident = Incident(building_id=building_id, **payload.model_dump())
    db.add(incident)
    db.commit()
    db.refresh(incident)
    invalidate_graph_cache(building_id)
    audit(
        db,
        None,
        "incident.create",
        target_type="incident",
        target_id=incident.id,
        payload={
            "building_id": building_id,
            "type": payload.incident_type,
            "node_key": payload.node_key,
            "severity": payload.severity,
        },
    )
    broadcast_sync(
        building_id,
        "incident.created",
        {
            "id": incident.id,
            "node_key": incident.node_key,
            "incident_type": incident.incident_type,
            "severity": incident.severity,
        },
    )
    return incident


@router.get("/{building_id}/incidents", response_model=Page[IncidentResponse])
def list_incidents(
    building_id: int,
    active_only: bool = True,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")

    q = db.query(Incident).filter(Incident.building_id == building_id)
    if active_only:
        q = q.filter(Incident.is_active == True)  # noqa: E712
    total = q.count()
    items = q.order_by(Incident.reported_at.desc()).offset(offset).limit(limit).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.patch("/{building_id}/incidents/{incident_id}", response_model=IncidentResponse)
def resolve_incident(
    building_id: int,
    incident_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role("operator")),
):
    incident = (
        db.query(Incident)
        .filter(
            Incident.id == incident_id,
            Incident.building_id == building_id,
        )
        .first()
    )
    if not incident:
        raise HTTPException(404, detail="Incident not found")

    incident.is_active = False
    db.commit()
    db.refresh(incident)
    invalidate_graph_cache(building_id)
    audit(
        db,
        actor,
        "incident.resolve",
        target_type="incident",
        target_id=incident_id,
        payload={
            "building_id": building_id,
            "node_key": incident.node_key,
            "type": incident.incident_type,
        },
    )
    broadcast_sync(
        building_id,
        "incident.resolved",
        {
            "id": incident.id,
            "node_key": incident.node_key,
            "incident_type": incident.incident_type,
        },
        actor=actor,
    )
    return incident
