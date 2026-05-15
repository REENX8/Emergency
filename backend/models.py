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
