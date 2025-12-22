import sys
import os
import random
from datetime import datetime, timedelta

# Add parent directory to path to allow importing app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import RoadSegment, CleanedMeasurement
from sqlalchemy import func

def seed_obstacle_data():
    db = SessionLocal()
    try:
        # 1. Get valid segment ID
        segment = db.query(RoadSegment).first()
        if not segment:
            print("Error: No road segments found in database. Please run seed_roads.py first.")
            return

        segment_id = segment.id
        print(f"Using Segment ID: {segment_id} ({segment.name})")

        # 2. Configuration
        base_lat = 49.741
        base_lon = 13.385
        # Set date to tomorrow (relative to the user's prompt context date of 2025-12-22)
        target_date = datetime(2025, 12, 23, 12, 0, 0)
        
        measurements = []

        # 3. Generate 20 points
        print("Generating 20 critical points...")
        for _ in range(20):
            # Random jitter approx 5 meters
            jitter_lat = random.uniform(-0.00005, 0.00005)
            jitter_lon = random.uniform(-0.00005, 0.00005)
            
            lat = base_lat + jitter_lat
            lon = base_lon + jitter_lon
            
            # Create WKT point
            wkt_geom = f"POINT({lon} {lat})"
            
            measurement = CleanedMeasurement(
                raw_measurement_id=9999, # Static raw ID (must exist in raw_measurements table)
                cleaned_width=220.0, # Critical width
                quality_score=1.0,
                geom=wkt_geom,
                created_at=target_date
            )
            measurements.append(measurement)

        # 4. Save to DB
        db.add_all(measurements)
        db.commit()

        print(f"Success: Seeded 20 critical points at {base_lat}, {base_lon} for date {target_date.date()}")

    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_obstacle_data()
