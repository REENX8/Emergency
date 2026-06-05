"""
models.py — SQLAlchemy ORM models
"""

from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class Building(Base):
    __tablename__ = "buildings"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String, nullable=False)
    address        = Column(String, default="")
    description    = Column(String, default="")
    tmd_station_id = Column(String, default="515201")   # TMD weather station for wind data
    has_sprinkler  = Column(Boolean, default=False)     # affects max travel distance (60m vs 30m)
    building_type  = Column(String, default="office")   # office / residential / assembly / mixed
    total_floors   = Column(Integer, default=1)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    floors    = relationship("Floor",    back_populates="building", cascade="all, delete-orphan")
    nodes     = relationship("Node",     back_populates="building", cascade="all, delete-orphan")
    edges     = relationship("Edge",     back_populates="building", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="building", cascade="all, delete-orphan")


class Floor(Base):
    __tablename__ = "floors"

    id              = Column(Integer, primary_key=True, index=True)
    building_id     = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    floor_number    = Column(Integer, nullable=False)
    image_filename  = Column(String, default="")     # relative path inside uploads/
    image_width_px  = Column(Integer, default=0)
    image_height_px = Column(Integer, default=0)
    scale_px_per_m  = Column(Float,   default=6.0)   # pixels per metre

    building = relationship("Building", back_populates="floors")


class Node(Base):
    __tablename__ = "nodes"

    id           = Column(Integer, primary_key=True, index=True)
    building_id  = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    node_key     = Column(String, nullable=False)    # unique string id within building
    type         = Column(String, default="room")    # room / corridor / stair / exit
    label        = Column(String, default="")
    x            = Column(Float, default=0.0)
    y            = Column(Float, default=0.0)
    capacity     = Column(Integer, default=20)
    floor_number = Column(Integer, default=1)
    area_m2      = Column(Float, nullable=True)      # optional floor area for occupancy check

    building = relationship("Building", back_populates="nodes")


class Edge(Base):
    __tablename__ = "edges"

    id          = Column(Integer, primary_key=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    u_key       = Column(String, nullable=False)
    v_key       = Column(String, nullable=False)
    distance_m  = Column(Float, default=10.0)
    width_m     = Column(Float, default=2.0)
    is_stair    = Column(Boolean, default=False)

    building = relationship("Building", back_populates="edges")


class Incident(Base):
    __tablename__ = "incidents"

    id            = Column(Integer, primary_key=True, index=True)
    building_id   = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    node_key      = Column(String, nullable=False)
    incident_type = Column(String, nullable=False)   # fire / smoke / crowd
    severity      = Column(Float, default=0.5)       # 0.0 – 1.0
    reported_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active     = Column(Boolean, default=True)

    building = relationship("Building", back_populates="incidents")


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role          = Column(String, nullable=False, default="operator")  # admin / operator / viewer
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    actor_email = Column(String, nullable=True)
    action      = Column(String, nullable=False, index=True)   # e.g. building.create
    target_type = Column(String, nullable=True)                # e.g. building / node / incident
    target_id   = Column(String, nullable=True)
    payload     = Column(String, default="")                   # JSON-encoded snapshot (short)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
