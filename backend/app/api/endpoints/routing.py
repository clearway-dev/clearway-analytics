from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database import get_db

router = APIRouter()


class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    vehicle_width_cm: float
    target_date: Optional[date] = None


def _find_edge_snap(conn, lon: float, lat: float):
    """Find the nearest road edge and the fraction [0,1] along it.

    Uses pgr_findCloseEdges which measures true line geometry distance and
    returns a ST_LineLocatePoint-based fraction. Returns (seq_id, fraction)
    or (None, None).
    """
    row = conn.execute(
        text("""
            SELECT edge_id, fraction
            FROM pgr_findCloseEdges(
                'SELECT seq_id AS id, geom FROM road_segments
                 WHERE source IS NOT NULL AND target IS NOT NULL',
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                0.005
            )
            LIMIT 1
        """),
        {"lon": lon, "lat": lat},
    ).first()
    if row is None:
        return None, None
    # Clamp away from exact 0/1 — pgr_withPoints has a known bug when
    # fraction == 0.0 or 1.0 (click lands exactly on a topology vertex).
    fraction = max(0.001, min(0.999, float(row.fraction)))
    return int(row.edge_id), fraction


def _trim_geom(conn, edge_id: int, frac: float, from_frac: float, to_frac: float):
    """Return GeoJSON for a sub-segment of an edge between two fractions.

    If from_frac > to_frac the sub-segment is reversed so the line direction
    matches the routing direction (source→target or target→source).
    """
    if abs(from_frac - to_frac) < 0.0001:
        return None

    lo, hi = min(from_frac, to_frac), max(from_frac, to_frac)
    reverse = from_frac > to_frac

    expr = f"ST_LineSubstring(geom, {lo:.8f}, {hi:.8f})"
    if reverse:
        expr = f"ST_Reverse({expr})"

    row = conn.execute(
        text(f"SELECT ST_AsGeoJSON({expr})::json FROM road_segments WHERE seq_id = :eid"),
        {"eid": edge_id},
    ).first()
    return row[0] if row else None


@router.post("/route", response_model=dict, dependencies=[Depends(get_current_active_user)])
def find_route(body: RouteRequest, db: Session = Depends(get_db)):
    """
    Find the shortest passable route between two geographic points.

    Uses pgr_withPoints + pgr_findCloseEdges for precise mid-segment snapping.
    The route geometry is trimmed at start/end so the line begins and ends
    exactly at the clicked positions, not at road intersections.
    """
    start_edge_id, start_frac = _find_edge_snap(db, body.start_lon, body.start_lat)
    end_edge_id, end_frac = _find_edge_snap(db, body.end_lon, body.end_lat)

    if start_edge_id is None or end_edge_id is None:
        raise HTTPException(status_code=404, detail="No road network found near the selected points.")

    if start_edge_id == end_edge_id and abs(start_frac - end_frac) < 0.001:
        return {"status": "no_route", "message": "Start and end point are at the same location."}

    # vehicle_width_cm is validated as float by Pydantic — safe to embed in the
    # pgRouting sub-query string (pgr_withPoints executes it internally so
    # SQLAlchemy bind-params cannot be used inside that string).
    width = float(body.vehicle_width_cm)

    # Build the date filter for the pgRouting sub-query the same way:
    # body.target_date is validated as `date` by Pydantic, so .isoformat()
    # always produces a safe "YYYY-MM-DD" string.
    if body.target_date:
        inner_date_join = f"AND ss.stat_date = '{body.target_date.isoformat()}'"
    else:
        inner_date_join = "AND ss.stat_date = (SELECT MAX(stat_date) FROM segment_statistics)"

    inner_sql = f"""
        SELECT
            rs.seq_id AS id,
            rs.source,
            rs.target,
            CASE
                WHEN ss.min_width IS NULL
                    THEN ST_Length(rs.geom::geography)
                WHEN ss.min_width < {width}
                    THEN 9999999
                ELSE ST_Length(rs.geom::geography)
            END AS cost,
            CASE
                WHEN ss.min_width IS NULL
                    THEN ST_Length(rs.geom::geography)
                WHEN ss.min_width < {width}
                    THEN 9999999
                ELSE ST_Length(rs.geom::geography)
            END AS reverse_cost
        FROM road_segments rs
        LEFT JOIN segment_statistics ss
            ON ss.segment_id = rs.id {inner_date_join}
        WHERE rs.source IS NOT NULL AND rs.target IS NOT NULL
    """

    points_sql = (
        f"SELECT 1::integer AS pid, {start_edge_id}::bigint AS edge_id, "
        f"{start_frac:.8f}::float8 AS fraction, 'b'::char AS side "
        f"UNION ALL "
        f"SELECT 2::integer AS pid, {end_edge_id}::bigint AS edge_id, "
        f"{end_frac:.8f}::float8 AS fraction, 'b'::char AS side"
    )

    # The outer query uses a proper SQLAlchemy bind-parameter for the date
    # filter so no user input is interpolated into the SQL text directly.
    if body.target_date:
        outer_date_condition = "AND ss.stat_date = :target_date"
        route_params: dict = {
            "inner_sql": inner_sql,
            "points_sql": points_sql,
            "target_date": body.target_date,
        }
    else:
        outer_date_condition = "AND ss.stat_date = (SELECT MAX(stat_date) FROM segment_statistics)"
        route_params = {"inner_sql": inner_sql, "points_sql": points_sql}

    try:
        rows = db.execute(
            text(f"""
                SELECT
                    r.seq,
                    r.node,
                    r.edge,
                    r.cost,
                    ST_AsGeoJSON(rs.geom)::json AS geometry,
                    rs.name,
                    rs.source AS edge_source,
                    rs.target AS edge_target,
                    ss.avg_width
                FROM pgr_withPoints(:inner_sql, :points_sql, -1, -2,
                                    directed => false) r
                JOIN road_segments rs ON rs.seq_id = r.edge
                LEFT JOIN segment_statistics ss
                    ON ss.segment_id = rs.id {outer_date_condition}
                WHERE r.edge > 0
                ORDER BY r.seq
            """),
            route_params,
        ).fetchall()
    except Exception as e:
        error_msg = str(e)
        if "pgr_createTopology" in error_msg or "source" in error_msg:
            raise HTTPException(
                status_code=500,
                detail="Road network topology not initialised. Run scripts/setup_routing.py first.",
            )
        raise HTTPException(status_code=500, detail="Routing query failed.")

    if not rows:
        return {"status": "no_route", "message": "No passable route found between these points."}

    rows = list(rows)
    features = []

    for i, row in enumerate(rows):
        geom = row.geometry

        if i == 0 and len(rows) > 1:
            # First edge: trim from start_frac to whichever vertex we head toward.
            # rows[1].node is the first real intersection vertex after the virtual start.
            next_node = rows[1].node
            if next_node == row.edge_target:
                # Traversed source→target: show [start_frac, 1.0]
                geom = _trim_geom(db, start_edge_id, start_frac, start_frac, 1.0)
            else:
                # Traversed target→source: show [start_frac, 0.0] (reversed)
                geom = _trim_geom(db, start_edge_id, start_frac, start_frac, 0.0)

        elif i == len(rows) - 1 and len(rows) > 1:
            # Last edge: trim from departure vertex up to end_frac.
            # row.node is the vertex we departed from on this final edge.
            if row.node == row.edge_source:
                # Traversed source→target: show [0.0, end_frac]
                geom = _trim_geom(db, end_edge_id, end_frac, 0.0, end_frac)
            else:
                # Traversed target→source: show [1.0, end_frac] (reversed)
                geom = _trim_geom(db, end_edge_id, end_frac, 1.0, end_frac)

        if geom is None:
            geom = row.geometry  # fallback to full edge on any trim failure

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "seq": row.seq,
                    "name": row.name,
                    "avg_width": row.avg_width,
                    "segment_cost_m": round(row.cost, 2) if row.cost < 9999999 else None,
                },
                "geometry": geom,
            }
        )

    total_distance_m = sum(row.cost for row in rows if row.cost < 9999999)

    return {
        "status": "ok",
        "route": {"type": "FeatureCollection", "features": features},
        "total_distance_m": round(total_distance_m),
        "segment_count": len(rows),
    }
