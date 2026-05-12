import json
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db
from app.core.constants import SNAP_DISTANCE_DEG

router = APIRouter()


@router.get("/bbox", response_model=dict, dependencies=[Depends(get_current_active_user)])
async def get_segments_in_bbox(
    min_lat: float = Query(..., ge=-90, le=90),
    min_lon: float = Query(..., ge=-180, le=180),
    max_lat: float = Query(..., ge=-90, le=90),
    max_lon: float = Query(..., ge=-180, le=180),
    target_date: Optional[date] = Query(None),
    session_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    bbox_params = {
        "min_lon": min_lon,
        "min_lat": min_lat,
        "max_lon": max_lon,
        "max_lat": max_lat,
    }

    if session_id:
        # Live computation for a specific session — skip pre-aggregated segment_statistics
        query = text("""
            WITH nearest AS (
                SELECT DISTINCT ON (cm.id)
                    rs.id          AS segment_id,
                    cm.cleaned_width
                FROM cleaned_measurements cm
                JOIN raw_measurements rm   ON cm.raw_measurement_id = rm.id
                JOIN batches b             ON rm.batch_id           = b.id
                CROSS JOIN LATERAL (
                    SELECT rs.id
                    FROM road_segments rs
                    WHERE ST_DWithin(cm.geom, rs.geom, :snap_deg)
                    ORDER BY cm.geom <-> rs.geom
                    LIMIT 1
                ) rs
                WHERE b.session_id = CAST(:session_id AS uuid)
            ),
            agg AS (
                SELECT
                    segment_id,
                    AVG(cleaned_width) AS avg_width,
                    MIN(cleaned_width) AS min_width,
                    COUNT(*)           AS measurements_count
                FROM nearest
                GROUP BY segment_id
            )
            SELECT
                rs.id,
                rs.name,
                agg.avg_width,
                agg.min_width,
                agg.measurements_count,
                ST_AsGeoJSON(rs.geom) AS geometry
            FROM road_segments rs
            LEFT JOIN agg ON agg.segment_id = rs.id
            WHERE rs.geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
            LIMIT 15000
        """)
        params = {**bbox_params, "session_id": session_id, "snap_deg": SNAP_DISTANCE_DEG}
    else:
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
            LIMIT 15000
        """)
        params = bbox_params.copy()
        if target_date is not None:
            params["target_date"] = target_date

    rows = db.execute(query, params).fetchall()

    features = []
    for row in rows:
        try:
            geometry = json.loads(row.geometry)
        except (TypeError, ValueError):
            continue  # skip rows with malformed geometry rather than crashing
        features.append(
            {
                "type": "Feature",
                "id": str(row.id),
                "properties": {
                    "name": row.name if row.name and row.name != "nan" else None,
                    "avg_width": row.avg_width,
                    "min_width": row.min_width,
                    "measurements_count": row.measurements_count,
                },
                "geometry": geometry,
            }
        )

    return {"type": "FeatureCollection", "features": features}
