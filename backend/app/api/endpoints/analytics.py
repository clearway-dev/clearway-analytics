from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.database import get_db
from app.services.analytics_service import AnalyticsService
from app.services.ml_service import MLService
from app.api.deps import get_current_active_user

router = APIRouter()


@router.get("/sessions", dependencies=[Depends(get_current_active_user)])
async def get_sessions_for_date(
    target_date: date,
    db: Session = Depends(get_db),
):
    """Returns measurement sessions that collected data on the given date."""
    return AnalyticsService(db).get_sessions_for_date(target_date)


@router.get("/obstacles", dependencies=[Depends(get_current_active_user)])
async def get_obstacles(
    target_date: date = date.today(),
    min_lon: Optional[float] = None,
    min_lat: Optional[float] = None,
    max_lon: Optional[float] = None,
    max_lat: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """
    Detects physical obstacles using DBSCAN clustering on narrow measurements.
    Returns GeoJSON FeatureCollection of obstacle centroids.
    """
    obstacles = MLService(db).detect_obstacles(target_date, min_lon, min_lat, max_lon, max_lat)

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [obs["lon"], obs["lat"]]},
                "properties": {
                    "severity": obs["severity"],
                    "cluster_size": obs["cluster_size"],
                    "avg_width": obs["avg_width"],
                    "min_width": obs["min_width"],
                },
            }
            for obs in obstacles
        ],
    }
