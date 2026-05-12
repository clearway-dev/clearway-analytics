from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, String
from datetime import date
import json

from app.database import get_db
from app.models import RoadSegment, SegmentStatistics
from app.services.analytics_service import AnalyticsService
from app.api.deps import get_current_active_user
from app.core.constants import PASSABILITY_THRESHOLD_M

map_router = APIRouter()
stats_router = APIRouter()
roads_router = APIRouter()


@map_router.get("/segments", dependencies=[Depends(get_current_active_user)])
async def get_road_segments(
    target_date: date = date.today(),
    db: Session = Depends(get_db),
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
        func.ST_AsGeoJSON(RoadSegment.geom).label("geometry"),
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
                "status": status,
            },
        })

    return {"type": "FeatureCollection", "features": features}


@stats_router.get("/segment/{segment_id}/histogram", dependencies=[Depends(get_current_active_user)])
async def get_segment_histogram(
    segment_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns histogram data (width distribution) for a specific road segment.
    Used for charts in the frontend detail panel.
    """
    return AnalyticsService(db).get_segment_histogram(segment_id)


@roads_router.get("/search", dependencies=[Depends(get_current_active_user)])
async def search_roads(q: str, db: Session = Depends(get_db)):
    """
    Search for road segments by name (fulltext-like).
    Returns top 10 unique street names with their combined centroid coordinates.
    """
    if not q:
        return []

    results = db.query(
        func.max(cast(RoadSegment.id, String)).label("id"),
        RoadSegment.name,
        func.ST_Y(func.ST_Centroid(func.ST_Collect(RoadSegment.geom))).label("lat"),
        func.ST_X(func.ST_Centroid(func.ST_Collect(RoadSegment.geom))).label("lon"),
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
            "center_lon": row.lon,
        }
        for row in results
    ]
