from fastapi import APIRouter, Depends
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.database import get_db
from app.models import RoadSegment
from app.services.ml_service import MLService
from app.api.deps import get_current_active_user

router = APIRouter()


@router.get("/sessions", dependencies=[Depends(get_current_active_user)])
async def get_sessions_for_date(
    target_date: date,
    db: Session = Depends(get_db),
):
    """
    Returns measurement sessions that collected data on the given date.
    Each session represents one measurement run by a vehicle.
    """
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
    Optionally accepts a bounding box (min_lon, min_lat, max_lon, max_lat) to limit the search area.
    """
    obstacles = MLService(db).detect_obstacles(target_date, min_lon, min_lat, max_lon, max_lat)

    features = [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [obs["lon"], obs["lat"]],
            },
            "properties": {
                "severity": obs["severity"],
                "cluster_size": obs["cluster_size"],
                "avg_width": obs["avg_width"],
                "min_width": obs["min_width"],
            },
        }
        for obs in obstacles
    ]

    return {"type": "FeatureCollection", "features": features}
