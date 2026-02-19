import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter()


@router.get("/bbox", response_model=dict)
async def get_segments_in_bbox(
    min_lat: float = Query(...),
    min_lon: float = Query(...),
    max_lat: float = Query(...),
    max_lon: float = Query(...),
    db: Session = Depends(get_db),
):
    query = text("""
        SELECT
            rs.id,
            rs.name,
            ss.avg_width,
            ss.min_width,
            ST_AsGeoJSON(rs.geom) AS geometry
        FROM road_segments rs
        LEFT JOIN segment_statistics ss
            ON ss.segment_id = rs.id
            AND ss.stat_date = (
                SELECT MAX(stat_date) FROM segment_statistics
            )
        WHERE rs.geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
        LIMIT 1000
    """)

    rows = db.execute(query, {
        "min_lon": min_lon,
        "min_lat": min_lat,
        "max_lon": max_lon,
        "max_lat": max_lat,
    }).fetchall()

    features = [
        {
            "type": "Feature",
            "id": str(row.id),
            "properties": {
                "name": row.name,
                "avg_width": row.avg_width,
                "min_width": row.min_width,
            },
            "geometry": json.loads(row.geometry),
        }
        for row in rows
    ]

    return {"type": "FeatureCollection", "features": features}
