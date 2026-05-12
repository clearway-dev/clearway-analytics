from app.models import RoadSegment, SegmentStatistics
from sqlalchemy import select, func, cast, String
from app.database import get_db
from fastapi import FastAPI, Depends, HTTPException
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session
from datetime import date
import json
import io
import os
import tempfile
import zipfile
import geopandas as gpd
import pandas as pd
from shapely.geometry import shape
from app.services.analytics_service import AnalyticsService
from app.services.dashboard_service import DashboardService
from app.services.ml_service import MLService
from app.api.deps import get_current_active_user
from app.core.constants import PASSABILITY_THRESHOLD_M, PASSABILITY_THRESHOLD_CM
from app.api.endpoints import auth, maps, vehicles, routing, stations, ai, geocode

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
    "http://localhost",
    "http://localhost:5173", 
    "http://localhost:3000",
    "https://clearway.zephyron.tech", 
    "https://www.clearway.zephyron.tech"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --------------------------------------------------------------------------

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(maps.router, prefix="/api/v1/maps", tags=["maps"])
app.include_router(vehicles.router, prefix="/api/v1/vehicles", tags=["vehicles"])
app.include_router(routing.router, prefix="/api/v1/routing", tags=["routing"])
app.include_router(stations.router, prefix="/api/v1/stations", tags=["stations"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(geocode.router, prefix="/api/v1/geocode", tags=["geocode"])

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
        import logging
        logging.getLogger(__name__).error("Database connection error: %s", e)
        return {"database": "error", "detail": "Database unavailable"}

@app.get("/api/v1/map/segments", dependencies=[Depends(get_current_active_user)])
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
        status = "ok" if row.avg_width >= PASSABILITY_THRESHOLD_M else "narrow"

        features.append({
            "type": "Feature",
            "geometry": json.loads(row.geometry),
            "properties": {
                "segment_id": str(row.id),
                "name": row.name if row.name and row.name != "nan" else None,
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

@app.get("/api/v1/stats/segment/{segment_id}/histogram", dependencies=[Depends(get_current_active_user)])
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

@app.get("/api/v1/roads/search", dependencies=[Depends(get_current_active_user)])
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
            "name": row.name if row.name and row.name != "nan" else None,
            "center_lat": row.lat,
            "center_lon": row.lon
        }
        for row in results
    ]

@app.get("/api/v1/dashboard/stats", dependencies=[Depends(get_current_active_user)])
async def get_dashboard_stats(
    target_date: Optional[date] = None,
    vehicle_width_cm: float = PASSABILITY_THRESHOLD_CM,
    db: Session = Depends(get_db),
):
    """
    Returns global KPI statistics for the admin dashboard.
    """
    service = DashboardService(db)
    return service.get_global_stats(target_date, vehicle_width_cm)

@app.get("/api/v1/dashboard/coverage", dependencies=[Depends(get_current_active_user)])
async def get_coverage_map(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Returns GeoJSON heatmap of measurement coverage.
    If target_date is provided, shows coverage for that date only.
    """
    service = DashboardService(db)
    return service.get_coverage_map_data(target_date)

@app.get("/api/v1/dashboard/available-dates", dependencies=[Depends(get_current_active_user)])
async def get_available_dates(db: Session = Depends(get_db)):
    """
    Returns a list of dates for which data is available.
    """
    service = DashboardService(db)
    return {"dates": service.get_available_dates()}

@app.get("/api/v1/export/preview", dependencies=[Depends(get_current_active_user)])
async def export_preview(
    mode: str = "single",
    target_date: Optional[date] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """
    Returns segment count and date coverage for the given export configuration.
    Used to show a live preview on the export page before downloading.
    """
    if mode == "single":
        target = target_date or date.today()
        count = db.query(func.count(SegmentStatistics.id)).filter(
            SegmentStatistics.stat_date == target
        ).scalar()
        return {
            "segment_count": count or 0,
            "date_from": str(target),
            "date_to": str(target),
            "days_with_data": 1 if (count or 0) > 0 else 0,
        }

    q = db.query(
        func.count(func.distinct(SegmentStatistics.segment_id)).label("segment_count"),
        func.min(SegmentStatistics.stat_date).label("date_from"),
        func.max(SegmentStatistics.stat_date).label("date_to"),
        func.count(func.distinct(SegmentStatistics.stat_date)).label("days_with_data"),
    )
    if mode == "range":
        if from_date:
            q = q.filter(SegmentStatistics.stat_date >= from_date)
        if to_date:
            q = q.filter(SegmentStatistics.stat_date <= to_date)

    result = q.one()
    return {
        "segment_count": result.segment_count or 0,
        "date_from": str(result.date_from) if result.date_from else None,
        "date_to": str(result.date_to) if result.date_to else None,
        "days_with_data": result.days_with_data or 0,
    }


def _build_export_rows(results, mode: str):
    """Convert raw DB rows into a list of dicts ready for any export format."""
    rows = []
    for row in results:
        avg = round(float(row.avg_width), 2) if row.avg_width is not None else None
        rows.append({
            "segment_id": str(row.id),
            "osm_id": row.osm_id,
            "name": row.name if row.name and row.name != "nan" else None,
            "road_type": row.road_type,
            "avg_width": avg,
            "min_width": row.min_width,
            "max_width": row.max_width,
            "measurements_count": int(row.measurements_count) if row.measurements_count else 0,
            "status": "ok" if (avg or 0) >= PASSABILITY_THRESHOLD_M else "narrow",
            "date_from": str(row.date_from),
            "date_to": str(row.date_to),
            "geometry": row.geometry,
        })
    return rows


@app.get("/api/v1/export/segments", dependencies=[Depends(get_current_active_user)])
async def export_segments(
    mode: str = "single",
    target_date: Optional[date] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    format: str = "geojson",
    db: Session = Depends(get_db)
):
    """
    Exports road segment statistics in GeoJSON, Shapefile, or CSV format.
    Modes:
      single — stats for one specific date
      range  — aggregated stats between from_date and to_date
      all    — aggregated stats across all available data
    """
    if format not in ("geojson", "shapefile", "csv"):
        raise HTTPException(status_code=400, detail="format must be one of: geojson, shapefile, csv")
    if mode not in ("single", "range", "all"):
        raise HTTPException(status_code=400, detail="mode must be one of: single, range, all")

    if mode == "single":
        target = target_date or date.today()
        results = db.query(
            RoadSegment.id,
            RoadSegment.osm_id,
            RoadSegment.name,
            RoadSegment.road_type,
            SegmentStatistics.avg_width,
            SegmentStatistics.min_width,
            SegmentStatistics.max_width,
            SegmentStatistics.measurements_count,
            SegmentStatistics.stat_date.label("date_from"),
            SegmentStatistics.stat_date.label("date_to"),
            func.ST_AsGeoJSON(RoadSegment.geom).label("geometry")
        ).join(
            SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
        ).filter(
            SegmentStatistics.stat_date == target
        ).all()
        filename_suffix = str(target)
    else:
        q = db.query(
            RoadSegment.id,
            RoadSegment.osm_id,
            RoadSegment.name,
            RoadSegment.road_type,
            (func.sum(SegmentStatistics.avg_width * SegmentStatistics.measurements_count) /
             func.nullif(func.sum(SegmentStatistics.measurements_count), 0)).label("avg_width"),
            func.min(SegmentStatistics.min_width).label("min_width"),
            func.max(SegmentStatistics.max_width).label("max_width"),
            func.sum(SegmentStatistics.measurements_count).label("measurements_count"),
            func.min(SegmentStatistics.stat_date).label("date_from"),
            func.max(SegmentStatistics.stat_date).label("date_to"),
            func.ST_AsGeoJSON(RoadSegment.geom).label("geometry")
        ).join(
            SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
        )
        if mode == "range":
            if from_date:
                q = q.filter(SegmentStatistics.stat_date >= from_date)
            if to_date:
                q = q.filter(SegmentStatistics.stat_date <= to_date)
        results = q.group_by(
            RoadSegment.id,
            RoadSegment.osm_id,
            RoadSegment.name,
            RoadSegment.road_type,
            RoadSegment.geom,
        ).all()
        filename_suffix = f"{from_date}_to_{to_date}" if mode == "range" else "all_time"

    if not results:
        raise HTTPException(status_code=404, detail="No data found for the selected criteria")

    filename_base = f"clearway_segments_{filename_suffix}"
    rows_data = _build_export_rows(results, mode)

    if format == "geojson":
        features = [
            {
                "type": "Feature",
                "geometry": json.loads(r["geometry"]),
                "properties": {k: v for k, v in r.items() if k != "geometry"},
            }
            for r in rows_data
        ]
        content = json.dumps({"type": "FeatureCollection", "features": features})
        return Response(
            content=content,
            media_type="application/geo+json",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.geojson"'},
        )

    if format == "csv":
        csv_rows = [{k: v for k, v in r.items() if k != "geometry"} for r in rows_data]
        content = pd.DataFrame(csv_rows).to_csv(index=False)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.csv"'},
        )

    # shapefile
    shp_rows = [
        {
            "segment_id": r["segment_id"],
            "osm_id": r["osm_id"],
            "name": r["name"],
            "road_type": r["road_type"],
            "avg_width": r["avg_width"],
            "min_width": r["min_width"],
            "max_width": r["max_width"],
            "meas_count": r["measurements_count"],  # 10-char DBF field name limit
            "status": r["status"],
            "date_from": r["date_from"],
            "date_to": r["date_to"],
        }
        for r in rows_data
    ]
    geometries = [shape(json.loads(r["geometry"])) for r in rows_data]
    gdf = gpd.GeoDataFrame(shp_rows, geometry=geometries, crs="EPSG:4326")

    with tempfile.TemporaryDirectory() as tmpdir:
        shp_path = os.path.join(tmpdir, "clearway_segments.shp")
        gdf.to_file(shp_path, driver="ESRI Shapefile")

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
                fpath = os.path.join(tmpdir, f"clearway_segments{ext}")
                if os.path.exists(fpath):
                    zf.write(fpath, f"clearway_segments{ext}")
        zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.zip"'},
    )


@app.get("/api/v1/analytics/sessions", dependencies=[Depends(get_current_active_user)])
async def get_sessions_for_date(
    target_date: date,
    db: Session = Depends(get_db),
):
    """
    Returns measurement sessions that collected data on the given date.
    Each session represents one measurement run by a vehicle.
    """
    from sqlalchemy import text as sql_text
    rows = db.execute(
        sql_text("""
            SELECT
                s.id,
                MIN(rm.measured_at) AS started_at,
                MAX(rm.measured_at) AS ended_at,
                COUNT(cm.id)        AS measurement_count
            FROM sessions s
            JOIN batches b             ON b.session_id          = s.id
            JOIN raw_measurements rm   ON rm.batch_id           = b.id
            JOIN cleaned_measurements cm ON cm.raw_measurement_id = rm.id
            WHERE DATE(rm.measured_at) = :d
            GROUP BY s.id
            ORDER BY started_at
        """),
        {"d": target_date},
    ).fetchall()

    return [
        {
            "id": str(row.id),
            "started_at": row.started_at.isoformat(),
            "ended_at": row.ended_at.isoformat(),
            "measurement_count": int(row.measurement_count),
        }
        for row in rows
    ]


@app.get("/api/v1/analytics/obstacles", dependencies=[Depends(get_current_active_user)])
async def get_obstacles(
    target_date: date = date.today(),
    min_lon: Optional[float] = None,
    min_lat: Optional[float] = None,
    max_lon: Optional[float] = None,
    max_lat: Optional[float] = None,
    db: Session = Depends(get_db)
):
    """
    Detects physical obstacles using DBSCAN clustering on narrow measurements.
    Returns GeoJSON FeatureCollection of obstacle centroids.
    Optionally accepts a bounding box (min_lon, min_lat, max_lon, max_lat) to limit the search area.
    """
    ml_service = MLService(db)
    obstacles = ml_service.detect_obstacles(target_date, min_lon, min_lat, max_lon, max_lat)

    features = []
    for obs in obstacles:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [obs["lon"], obs["lat"]]  # GeoJSON is [lon, lat]
            },
            "properties": {
                "severity": obs["severity"],
                "cluster_size": obs["cluster_size"],
                "avg_width": obs["avg_width"],
                "min_width": obs["min_width"],
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }