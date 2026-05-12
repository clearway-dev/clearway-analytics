from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.services.analytics_service import AnalyticsService
from app.api.deps import get_current_active_user

router = APIRouter()
map_router = APIRouter()
stats_router = APIRouter()
roads_router = APIRouter()


@map_router.get("/segments", dependencies=[Depends(get_current_active_user)])
async def get_road_segments(
    target_date: date = date.today(),
    db: Session = Depends(get_db),
):
    """Returns a GeoJSON FeatureCollection of road segments with statistics for a given date."""
    return AnalyticsService(db).get_road_segments(target_date)


@stats_router.get("/segment/{segment_id}/histogram", dependencies=[Depends(get_current_active_user)])
async def get_segment_histogram(
    segment_id: str,
    db: Session = Depends(get_db),
):
    """Returns histogram data (width distribution) for a specific road segment."""
    return AnalyticsService(db).get_segment_histogram(segment_id)


@roads_router.get("/search", dependencies=[Depends(get_current_active_user)])
async def search_roads(q: str, db: Session = Depends(get_db)):
    """Search for road segments by name; returns top 10 unique names with centroids."""
    if not q:
        return []
    return AnalyticsService(db).search_roads(q)
