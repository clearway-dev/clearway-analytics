import sys
import os
import random
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import RoadSegment, CleanedMeasurement, RawMeasurement

def seed_obstacle_data():
    db = SessionLocal()
    try:
        # 1. Get segment
        segment = db.query(RoadSegment).first()
        if not segment:
            print("ERROR: No RoadSegments. Did you run seed_roads.py?")
            return

        print(f"Using Segment ID: {segment.id}")

        # 2. Configuration
        base_lat = 49.741
        base_lon = 13.385
        target_date = datetime(2026, 2, 1, 12, 0, 0)
        raw_id = 9999
        raw_parent = db.query(RawMeasurement).filter(RawMeasurement.id == raw_id).first()
        
        if not raw_parent:
            print(f"Creating missing RawMeasurement with ID {raw_id}...")
            # Create dummy parent
            # Use the same geometry as obstacle center
            wkt_base = f"POINT({base_lon} {base_lat})"
            
            raw_parent = RawMeasurement(
                id=raw_id,
                timestamp=target_date,
                geom=wkt_base,
            )
            db.add(raw_parent)
            db.commit() # Save it so it can be referenced
            print("RawMeasurement 9999 created.")
        else:
            print("RawMeasurement 9999 already exists, continuing...")
        # -----------------------------------------------

        measurements = []

        # 3. Generate 20 points
        print(f"Generating 20 points for date {target_date}...")
        for _ in range(20):
            jitter_lat = random.uniform(-0.00005, 0.00005)
            jitter_lon = random.uniform(-0.00005, 0.00005)
            
            lat = base_lat + jitter_lat
            lon = base_lon + jitter_lon
            
            wkt_geom = f"POINT({lon} {lat})"
            
            measurement = CleanedMeasurement(
                raw_measurement_id=raw_id, # Teď už bezpečné ID
                cleaned_width=220.0,
                quality_score=1.0,
                geom=wkt_geom,
                created_at=target_date
            )
            measurements.append(measurement)

        # 4. Save
        db.add_all(measurements)
        db.commit()

        print("DONE: Data for 2/1/2026 is in the database.")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_obstacle_data()