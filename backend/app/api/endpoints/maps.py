import json
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db

router = APIRouter()


@router.get("/bbox", response_model=dict, dependencies=[Depends(get_current_active_user)])
async def get_segments_in_bbox(
    min_lat: float = Query(...),
    min_lon: float = Query(...),
    max_lat: float = Query(...),
    max_lon: float = Query(...),
    target_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    date_filter = (
        ":target_date"
        if target_date is not None
        else "(SELECT MAX(stat_date) FROM segment_statistics)"
    )

    query = text(f"""
        SELECT
            rs.id,
            rs.name,
            ss.avg_width,
            ss.min_width,
            ss.measurements_count,
            ST_AsGeoJSON(rs.geom) AS geometry
        FROM road_segments rs
        LEFT JOIN segment_statistics ss
            ON ss.segment_id = rs.id
            AND ss.stat_date = {date_filter}
        WHERE rs.geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
        LIMIT 1000
    """)

    params = {
        "min_lon": min_lon,
        "min_lat": min_lat,
        "max_lon": max_lon,
        "max_lat": max_lat,
    }
    if target_date is not None:
        params["target_date"] = target_date

    rows = db.execute(query, params).fetchall()

    features = [
        {
            "type": "Feature",
            "id": str(row.id),
            "properties": {
                "name": row.name,
                "avg_width": row.avg_width,
                "min_width": row.min_width,
                "measurements_count": row.measurements_count,
            },
            "geometry": json.loads(row.geometry),
        }
        for row in rows
    ]

    return {"type": "FeatureCollection", "features": features}
