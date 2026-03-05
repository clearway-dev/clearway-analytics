# Run with: fastmcp run app/mcp/server.py:mcp --transport sse --port 8001

import sys
import os

# Add the backend directory to sys.path to allow imports from 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastmcp import FastMCP
from sqlalchemy import inspect, text, func
from sqlalchemy.exc import IntegrityError
from app.database import engine, SessionLocal
from app.services.analytics_service import AnalyticsService
from app.models import SegmentStatistics, TargetVehicle
from datetime import datetime, date
import json

# Initialize FastMCP application
mcp = FastMCP("ClearWay Context")

@mcp.tool()
def list_tables() -> list[str]:
    """
    Returns a list of all tables in the database.
    Useful for understanding the database structure.
    """
    inspector = inspect(engine)
    return inspector.get_table_names()

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

@mcp.tool()
def run_read_only_sql(query: str) -> list[dict]:
    """
    Executes a read-only SQL query against the database.
    
    Args:
        query: The SQL query string. Must start with SELECT.
               Cannot contain modification commands (DROP, DELETE, INSERT, UPDATE, TRUNCATE).
               
    Returns:
        A list of dictionaries representing the rows returned by the query.
    """
    query_str = query.strip()
    
    # Security checks
    if not query_str.upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed.")
    
    forbidden_keywords = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE"]
    if any(keyword in query_str.upper() for keyword in forbidden_keywords):
        raise ValueError("Forbidden SQL keyword detected. Only read-only queries are allowed.")
    
    with SessionLocal() as db:
        try:
            result = db.execute(text(query_str)).mappings().all()
            # Convert to list of dicts and handle serialization logic if needed manually, 
            # or rely on FastMCP's serialization. 
            # We explicitly convert to dicts with stringified dates to ensure compatibility.
            output = []
            for row in result:
                row_dict = dict(row)
                # JSON serialization check/conversion for common non-serializable types
                for key, value in row_dict.items():
                    if isinstance(value, (datetime, date)):
                        row_dict[key] = value.isoformat()
                output.append(row_dict)
            return output
        except Exception as e:
            return [{"error": str(e)}]

@mcp.tool()
def get_daily_analytics(target_date: str) -> dict:
    """
    Calculates and retrieves daily statistics for a given date.
    
    Args:
        target_date: Date string in YYYY-MM-DD format.
        
    Returns:
        A summary dictionary containing the processing results.
    """
    try:
        target_date_obj = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        return {"error": "Invalid date format. Please use YYYY-MM-DD."}

    with SessionLocal() as db:
        status_message = "Success"
        service = AnalyticsService(db)
        
        try:
            # Calculate stats (logic from AnalyticsService)
            service.calculate_daily_stats(target_date_obj)
        except IntegrityError:
            db.rollback()
            status_message = "Data already exists for this date. Returning existing stats."
        except Exception as e:
            db.rollback()
            return {"error": f"An unexpected error occurred: {str(e)}"}
        
        # Query the results to return a summary
        stats = db.query(
            func.count(SegmentStatistics.id).label("total_segments"),
            func.avg(SegmentStatistics.avg_width).label("average_width"),
            func.sum(SegmentStatistics.measurements_count).label("total_measurements")
        ).filter(SegmentStatistics.stat_date == target_date_obj).first()
        
        return {
            "status": status_message,
            "date": target_date,
            "data": {
                "processed_segments": stats.total_segments if stats else 0,
                "average_network_width": round(float(stats.average_width), 2) if stats and stats.average_width else None,
                "total_measurements_processed": int(stats.total_measurements) if stats and stats.total_measurements else 0
            }
        }

@mcp.tool()
def create_vehicle(
    name: str,
    category: str | None = None,
    width: int | None = None,
    height: int | None = None,
    weight: float | None = None,
    length: int | None = None,
    turning_diameter_track: int | None = None,
    turning_diameter_clearance: int | None = None,
    stabilization_width: int | None = None,
) -> dict:
    """
    Inserts a new vehicle into the target_vehicles table.

    All numeric fields are in SI units:
      - width, height, length, turning_diameter_track,
        turning_diameter_clearance, stabilization_width  → centimetres (INTEGER)
      - weight → tonnes

    Args:
        name: Vehicle name, e.g. "CAS 24 SCANIA" (required).
        category: Free-text category, e.g. "Cisterna", "Žebřík".
        width: Vehicle width in centimetres.
        height: Vehicle height in centimetres.
        weight: Vehicle weight in tonnes.
        length: Vehicle length in centimetres.
        turning_diameter_track: Track turning diameter in centimetres.
        turning_diameter_clearance: Clearance turning diameter in centimetres (nullable).
        stabilization_width: Width with stabilisers extended in centimetres (nullable).

    Returns:
        The saved vehicle record as a dict, including its generated id.
    """
    with SessionLocal() as db:
        vehicle = TargetVehicle(
            name=name,
            category=category,
            width=width,
            height=height,
            weight=weight,
            length=length,
            turning_diameter_track=turning_diameter_track,
            turning_diameter_clearance=turning_diameter_clearance,
            stabilization_width=stabilization_width,
        )
        db.add(vehicle)
        db.commit()
        db.refresh(vehicle)
        return {
            "id": str(vehicle.id),
            "name": vehicle.name,
            "category": vehicle.category,
            "width": vehicle.width,
            "height": vehicle.height,
            "weight": vehicle.weight,
            "length": vehicle.length,
            "turning_diameter_track": vehicle.turning_diameter_track,
            "turning_diameter_clearance": vehicle.turning_diameter_clearance,
            "stabilization_width": vehicle.stabilization_width,
            "created_at": vehicle.created_at.isoformat() if vehicle.created_at else None,
        }


@mcp.tool()
def get_road_features_in_bbox(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> list[dict]:
    """
    Retrieves road segments within a specific bounding box. Returns GeoJSON-compatible data. Limit 50 results to save context.
    """
    query = text("""
        SELECT
            id,
            name,
            ST_AsGeoJSON(geom) as geom_json
        FROM road_segments
        WHERE geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
        LIMIT 50
    """)

    with SessionLocal() as db:
        results = db.execute(query, {
            "min_lon": min_lon,
            "min_lat": min_lat,
            "max_lon": max_lon,
            "max_lat": max_lat
        }).mappings().all()

        features = []
        for row in results:
            features.append({
                "type": "Feature",
                "properties": {
                    "id": str(row["id"]),
                    "name": row["name"]
                },
                "geometry": json.loads(row["geom_json"])
            })

        return features
