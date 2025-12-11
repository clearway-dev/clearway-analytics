from sqlalchemy import Column, String, DateTime, func, Date, ForeignKey, Float, Integer, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from geoalchemy2 import Geometry
import uuid
from sqlalchemy.orm import relationship


class RoadSegment(Base):
    __tablename__ = "road_segments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    osm_id = Column(String(50), unique=True, nullable=False)

    name = Column(String(255), nullable=True)

    road_type = Column(String(50), nullable=True)

    geom = Column(Geometry("LINESTRING", srid=4326), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class CleanedMeasurement(Base):
    __tablename__ = "cleaned_measurements"

    id = Column(BigInteger, primary_key=True, index=True)

    cleaned_width = Column(Float, nullable=False)
    quality_score = Column(Float)

    geom = Column(Geometry("POINT", srid=4326), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SegmentStatistics(Base):
    __tablename__ = "segment_statistics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    segment_id = Column(UUID(as_uuid=True), ForeignKey("road_segments.id"), nullable=False)

    stat_date = Column(Date, nullable=False)

    avg_width= Column(Float)
    min_width= Column(Float)
    max_width= Column(Float)
    measurements_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    segment = relationship("RoadSegment")    