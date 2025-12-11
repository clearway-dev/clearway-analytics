from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from geoalchemy2 import Geometry
import uuid


class RoadSegment(Base):
    __tablename__ = "road_segments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    osm_id = Column(String(50), unique=True, nullable=False)

    name = Column(String(255), nullable=True)

    road_type = Column(String(50), nullable=True)

    geom = Column(Geometry("LINESTRING", srid=4326), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
