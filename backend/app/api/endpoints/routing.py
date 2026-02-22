import json
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter()


class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    vehicle_width_cm: float
    target_date: Optional[date] = None


def _snap_to_vertex(conn, lon: float, lat: float) -> Optional[int]:
    """Return the nearest topology vertex id to the given coordinate."""
    row = conn.execute(
        text("""
            SELECT id
            FROM road_segments_vertices_pgr
            ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
            LIMIT 1
        """),
        {"lon": lon, "lat": lat},
    ).first()
    return row.id if row else None


@router.post("/route", response_model=dict)
def find_route(body: RouteRequest, db: Session = Depends(get_db)):
    """
    Find the shortest passable route between two geographic points.

    Roads narrower than vehicle_width_cm are treated as impassable (cost = infinity).
    Roads with no width data are treated as passable (cost = real distance).

    Returns a GeoJSON FeatureCollection of the route segments plus total distance,
    or a {status: "no_route"} response when no path exists.
    """
    target_date_str = str(body.target_date) if body.target_date else None

    # Snap click coordinates to nearest graph vertices
    start_vid = _snap_to_vertex(db, body.start_lon, body.start_lat)
    end_vid = _snap_to_vertex(db, body.end_lon, body.end_lat)

    if start_vid is None or end_vid is None:
        raise HTTPException(status_code=404, detail="No road network vertices found near the selected points.")

    if start_vid == end_vid:
        return {"status": "no_route", "message": "Start and end point are on the same road segment."}

    # Build the date filter for the LEFT JOIN inside pgr_dijkstra's inner query.
    # target_date_str is either a validated ISO date string or None — safe to inline.
    if target_date_str:
        date_join = f"AND ss.stat_date = '{target_date_str}'"
    else:
        date_join = "AND ss.stat_date = (SELECT MAX(stat_date) FROM segment_statistics)"

    # vehicle_width_cm is a Pydantic-validated float — safe to inline.
    width = float(body.vehicle_width_cm)

    # Uses seq_id (bigserial) as the edge identifier — pgRouting requires integer, not UUID
    inner_sql = f"""
        SELECT
            rs.seq_id AS id,
            rs.source,
            rs.target,
            CASE
                WHEN ss.avg_width IS NULL
                    THEN ST_Length(rs.geom::geography)
                WHEN ss.avg_width < {width}
                    THEN 9999999
                ELSE ST_Length(rs.geom::geography)
            END AS cost
        FROM road_segments rs
        LEFT JOIN segment_statistics ss
            ON ss.segment_id = rs.id {date_join}
        WHERE rs.source IS NOT NULL AND rs.target IS NOT NULL
    """

    try:
        rows = db.execute(
            text(f"""
                SELECT
                    r.seq,
                    r.edge,
                    r.cost,
                    ST_AsGeoJSON(rs.geom)::json AS geometry,
                    rs.name,
                    ss.avg_width
                FROM pgr_dijkstra(:inner_sql, :start_vid, :end_vid) r
                JOIN road_segments rs ON rs.seq_id = r.edge
                LEFT JOIN segment_statistics ss
                    ON ss.segment_id = rs.id {date_join}
                WHERE r.edge != -1
                ORDER BY r.seq
            """),
            {"inner_sql": inner_sql, "start_vid": start_vid, "end_vid": end_vid},
        ).fetchall()
    except Exception as e:
        error_msg = str(e)
        if "pgr_createTopology" in error_msg or "source" in error_msg:
            raise HTTPException(
                status_code=500,
                detail="Road network topology not initialised. Run scripts/setup_routing.py first.",
            )
        raise HTTPException(status_code=500, detail=f"Routing error: {error_msg}")

    if not rows:
        return {"status": "no_route", "message": "No passable route found between these points."}

    features = [
        {
            "type": "Feature",
            "properties": {
                "seq": row.seq,
                "name": row.name,
                "avg_width": row.avg_width,
                "segment_cost_m": round(row.cost, 2) if row.cost < 9999999 else None,
            },
            "geometry": row.geometry,
        }
        for row in rows
    ]

    total_distance_m = sum(
        row.cost for row in rows if row.cost < 9999999
    )

    return {
        "status": "ok",
        "route": {"type": "FeatureCollection", "features": features},
        "total_distance_m": round(total_distance_m),
        "segment_count": len(rows),
    }
