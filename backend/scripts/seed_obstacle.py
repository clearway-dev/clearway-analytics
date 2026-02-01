import sys
import os
import random
import datetime
from geoalchemy2.elements import WKTElement

# Add parent directory to path to allow importing 'app' module
# Assuming this script is located at backend/scripts/seed_obstacle.py
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import SessionLocal
from app.models import CleanedMeasurement, RawMeasurement, Session, Sensor, Vehicle

def generate_random_point_in_radius(center_lat, center_lon, radius_meters):
    """
    Generates a random lat/lon within a rough radius in meters.
    """
    # Earth radius approximation, but for small distances flat earth assumption is fine-ish
    # 1 degree lat ~= 111,111 meters
    # 1 degree lon ~= 111,111 * cos(lat) meters
    
    # Random offset in meters
    angle = random.uniform(0, 2 * 3.14159)
    distance = random.uniform(0, radius_meters)
    
    lat_offset_meters = distance * 3.14159 # Using simplified component logic or just direct conversion
    # Better:
    # d_lat = distance * cos(angle) / 111111
    # d_lon = distance * sin(angle) / (111111 * cos(center_lat))
    
    d_lat = (distance * lambda_cos(angle)) / 111111.0
    d_lon = (distance * lambda_sin(angle)) / (111111.0 * 0.65) # approx cos(49)
    
    return center_lat + d_lat, center_lon + d_lon

def lambda_cos(x):
    import math
    return math.cos(x)

def lambda_sin(x):
    import math
    return math.sin(x)

def seed_obstacles():
    db = SessionLocal()
    try:
        print("Seeding obstacle data...")
        
        # Configuration
        # Plzeň coordinates (near namesti Republiky)
        base_lat = 49.747
        base_lon = 13.377

        # 0. Create dummy Sensor and Vehicle
        print("Creating dummy Sensor and Vehicle...")
        dummy_sensor = Sensor(
            description="Test Sensor",
            is_active=True
        )
        db.add(dummy_sensor)
        
        dummy_vehicle = Vehicle(
            vehicle_name="Test Vehicle",
            width=250.0
        )
        db.add(dummy_vehicle)
        db.flush()

        # 1. Create a dummy Session
        print("Creating dummy Session...")
        dummy_session = Session(
            sensor_id=dummy_sensor.id,
            vehicle_id=dummy_vehicle.id
        )
        db.add(dummy_session)
        db.flush()
        session_id = dummy_session.id
        print(f"Created dummy Session with ID: {session_id}")

        # Create a dummy RawMeasurement to satisfy FK/NotNull constraint
        print("Creating dummy RawMeasurement...")
        dummy_raw = RawMeasurement(
            session_id=session_id,
            measured_at=datetime.datetime.now(),
            latitude=base_lat,
            longitude=base_lon,
            distance_left=150.0,
            distance_right=150.0,
            is_valid=True
        )
        db.add(dummy_raw)
        db.flush() # Populate dummy_raw.id
        raw_id = dummy_raw.id
        print(f"Created dummy RawMeasurement with ID: {raw_id}")
        
        # Create a cluster of 15 points
        print(f"Creating cluster at {base_lat}, {base_lon}")
        
        cluster_points = []
        for _ in range(15):
            lat_off = (random.random() - 0.5) * (8.0 / 111111.0) # +/- 4 meters
            lon_off = (random.random() - 0.5) * (8.0 / (111111.0 * 0.65))
            
            lat = base_lat + lat_off
            lon = base_lon + lon_off
            
            meas = CleanedMeasurement(
                raw_measurement_id=raw_id,
                cleaned_width=random.uniform(240.0, 290.0),
                quality_score=random.uniform(0.8, 1.0),
                geom=WKTElement(f'POINT({lon} {lat})', srid=4326),
                created_at=datetime.datetime.now()
            )
            cluster_points.append(meas)
            
        db.add_all(cluster_points)
        print(f"Added {len(cluster_points)} points for cluster.")

        db.commit()
        print("Seeding complete successfully.")
        
    except Exception as e:
        print(f"Error seeding obstacles: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_obstacles()
