"""
routers/incidents.py — Report and resolve incidents (fire / smoke / crowd).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from dynamic_graph import invalidate_graph_cache
from models import Building, Incident, Node
from schemas import IncidentCreate, IncidentResponse

router = APIRouter(prefix="/buildings", tags=["incidents"])

VALID_TYPES = {"fire", "smoke", "crowd"}


@router.post("/{building_id}/incidents", response_model=IncidentResponse, status_code=201,
              dependencies=[Depends(get_current_user)])
def report_incident(building_id: int, payload: IncidentCreate, db: Session = Depends(get_db)):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")

    if payload.incident_type not in VALID_TYPES:
        raise HTTPException(400, detail=f"incident_type must be one of {sorted(VALID_TYPES)}")

    # Validate node exists in this building
    node = db.query(Node).filter(
        Node.building_id == building_id,
        Node.node_key == payload.node_key,
    ).first()
    if not node:
        raise HTTPException(400, detail=f"Node '{payload.node_key}' not found in building {building_id}")

    incident = Incident(building_id=building_id, **payload.model_dump())
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


@router.get("/{building_id}/incidents", response_model=list[IncidentResponse])
def list_incidents(
    building_id: int,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    if not db.get(Building, building_id):
        raise HTTPException(404, detail="Building not found")

    q = db.query(Incident).filter(Incident.building_id == building_id)
    if active_only:
        q = q.filter(Incident.is_active == True)  # noqa: E712
    return q.order_by(Incident.reported_at.desc()).all()


@router.patch("/{building_id}/incidents/{incident_id}", response_model=IncidentResponse,
               dependencies=[Depends(get_current_user)])
def resolve_incident(building_id: int, incident_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.building_id == building_id,
    ).first()
    if not incident:
        raise HTTPException(404, detail="Incident not found")

    incident.is_active = False
    db.commit()
    db.refresh(incident)
    invalidate_graph_cache(building_id)
    return incident
