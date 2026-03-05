from sqlalchemy import Column, String, DateTime, func, Date, ForeignKey, Float, Integer, BigInteger, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from geoalchemy2 import Geometry
import uuid
from sqlalchemy.orm import relationship

class Sensor(Base):
    __tablename__ = "sensors"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_name = Column(String(100), nullable=False)
    width = Column(Float, nullable=False)

class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sensor_id = Column(UUID(as_uuid=True), ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False)
    vehicle_id = Column(UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False)

class RawMeasurement(Base):
    __tablename__ = "raw_measurements"

    id = Column(BigInteger, primary_key=True, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    
    measured_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    distance_left = Column(Float, nullable=False)
    distance_right = Column(Float, nullable=False)
    
    # geom column does not exist in raw_measurements table in DB
    
    is_valid = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())


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
    raw_measurement_id = Column(BigInteger, nullable=True)
    
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


class Station(Base):
    __tablename__ = "stations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=True)
    address = Column(String(500), nullable=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False, default="dispatcher")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TargetVehicle(Base):
    __tablename__ = "target_vehicles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    width = Column(Integer, nullable=True)          # cm
    height = Column(Integer, nullable=True)         # cm
    weight = Column(Float, nullable=True)           # tonnes
    length = Column(Integer, nullable=True)         # cm
    turning_diameter_track = Column(Integer, nullable=True)      # cm
    turning_diameter_clearance = Column(Integer, nullable=True)  # cm
    stabilization_width = Column(Integer, nullable=True)         # cm
    created_at = Column(DateTime(timezone=True), server_default=func.now())
