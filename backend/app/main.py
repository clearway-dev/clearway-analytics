from app.models import RoadSegment, SegmentStatistics
from sqlalchemy import select, func, cast, String
from app.database import get_db
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import date
import json
from app.services.analytics_service import AnalyticsService
from app.services.dashboard_service import DashboardService

# Initialize the FastAPI application with metadata
app = FastAPI(
    title="ClearWay Analytics API",
    description="Backend service for analyzing and visualizing road passability data.",
    version="1.0.0"
)

# --------------------------------------------------------------------------
# CORS CONFIGURATION
# --------------------------------------------------------------------------
# Allow the frontend (React running on port 3000) to communicate with this API.
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --------------------------------------------------------------------------

@app.get("/")
async def root():
    """
    Root endpoint to verify the service is running.
    """
    return {
        "system": "ClearWay Analytics",
        "status": "online",
        "version": "1.0.0"
    }

@app.get("/api/status")
async def get_status(db: Session = Depends(get_db)):
    """
    Health check endpoint that verifies real database connectivity.
    Uses 'select(1)' to ensure the DB is reachable and can execute queries.
    """
    try:
        # Try to execute a simple query
        result = db.scalar(select(1))

        return {
            "database": "connected", 
            "status": "operational",
            "test_query_result": result # Should be 1 
        }
    except Exception as e:
        # Log the exception 
        print(f"Database connection error: {e}")
        return {
            "database": "error", 
            "detail": str(e)
    }

@app.get("/api/map/segments")
async def get_road_segments(
    target_date: date = date.today(), 
    db: Session = Depends(get_db)
):
    """
    Returns a GeoJSON FeatureCollection of road segments with statistics.
    Joins 'RoadSegment' (geometry) with 'SegmentStatistics' (data) for a specific date.
    """
    results = db.query(
        RoadSegment.id,
        RoadSegment.name,
        SegmentStatistics.avg_width,
        SegmentStatistics.min_width,
        SegmentStatistics.max_width,
        SegmentStatistics.measurements_count,
        func.ST_AsGeoJSON(RoadSegment.geom).label("geometry")
    ).join(
        SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
    ).filter(
        SegmentStatistics.stat_date == target_date
    ).all()

    features = []
    for row in results:
        status = "ok" if row.avg_width >= 3.0 else "narrow"

        features.append({
            "type": "Feature",
            "geometry": json.loads(row.geometry),
            "properties": {
                "segment_id": str(row.id),
                "name": row.name or "Unknown Road",
                "avg_width": row.avg_width,
                "min_width": row.min_width,
                "max_width": row.max_width,
                "measurements_count": row.measurements_count,
                "status": status
            }
        })
    
    return {
        "type": "FeatureCollection",
        "features": features
    }

@app.get("/api/stats/segment/{segment_id}/histogram")
async def get_segment_histogram(
    segment_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns histogram data (width distribution) for a specific road segment.
    Used for charts in the frontend detail panel.
    """   
    service = AnalyticsService(db)
    histogram_data = service.get_segment_histogram(segment_id)

    return histogram_data

@app.get("/api/roads/search")
async def search_roads(q: str, db: Session = Depends(get_db)):
    """
    Search for road segments by name (fulltext-like).
    Returns top 10 unique street names with their combined centroid coordinates.
    """
    if not q:
        return []

    # Search for segments where name contains 'q' (case-insensitive)
    # Group by name to avoid duplicates
    # Use ST_Collect to merge geometries of all segments with the same name, then find centroid
    results = db.query(
        func.max(cast(RoadSegment.id, String)).label("id"),
        RoadSegment.name,
        func.ST_Y(func.ST_Centroid(func.ST_Collect(RoadSegment.geom))).label("lat"),
        func.ST_X(func.ST_Centroid(func.ST_Collect(RoadSegment.geom))).label("lon")
    ).filter(
        RoadSegment.name.ilike(f"%{q}%")
    ).group_by(
        RoadSegment.name
    ).limit(10).all()

    return [
        {
            "id": str(row.id),
            "name": row.name,
            "center_lat": row.lat,
            "center_lon": row.lon
        }
        for row in results
    ]

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Returns global KPI statistics for the admin dashboard.
    """
    service = DashboardService(db)
    return service.get_global_stats()

@app.get("/api/dashboard/coverage")
async def get_coverage_map(db: Session = Depends(get_db)):
    """
    Returns GeoJSON heatmap of measurement coverage.
    """
    service = DashboardService(db)
    return service.get_coverage_map_data()