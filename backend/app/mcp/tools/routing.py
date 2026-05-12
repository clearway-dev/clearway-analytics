from fastmcp import FastMCP
from sqlalchemy import text
from app.database import SessionLocal
from app.api.endpoints.routing import _find_edge_snap
from app.core.constants import PASSABILITY_THRESHOLD_CM
from app.mcp._helpers import _parse_date

routing_server = FastMCP("ClearWay Routing")


@routing_server.tool()
def find_passable_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    vehicle_width_cm: float = PASSABILITY_THRESHOLD_CM,
    target_date: str | None = None,
) -> dict:
    """
    Finds the shortest passable route between two geographic coordinates for a
    vehicle of the given width. Roads narrower than vehicle_width_cm are
    penalised with a very high cost so the router avoids them.

    Args:
        start_lat, start_lon: Route start in WGS-84 degrees.
        end_lat, end_lon:     Route end in WGS-84 degrees.
        vehicle_width_cm:     Vehicle width in centimetres. Default 300 cm.
        target_date:          YYYY-MM-DD. Uses latest available date if omitted.

    Returns:
        status ("ok" | "no_route" | "topology_unavailable"), total_distance_m,
        segment_count, per-segment summary (name, avg_width, passable, cost_m),
        and any warnings (e.g. unmeasured segments).
    """
    try:
        date_obj = _parse_date(target_date)
    except ValueError as e:
        return {"error": str(e)}

    width = float(vehicle_width_cm)

    with SessionLocal() as db:
        start_edge_id, start_frac = _find_edge_snap(db, start_lon, start_lat)
        end_edge_id, end_frac = _find_edge_snap(db, end_lon, end_lat)

        if start_edge_id is None or end_edge_id is None:
            return {
                "status": "no_route",
                "message": "No road network found near one or both of the given points.",
            }

        if start_edge_id == end_edge_id and abs(start_frac - end_frac) < 0.001:
            return {"status": "no_route", "message": "Start and end point are the same."}

        if date_obj:
            inner_date_join = f"AND ss.stat_date = '{date_obj.isoformat()}'"
            outer_date_condition = "AND ss.stat_date = :target_date"
            route_params: dict = {"target_date": date_obj}
        else:
            inner_date_join = (
                "AND ss.stat_date = (SELECT MAX(stat_date) FROM segment_statistics)"
            )
            outer_date_condition = (
                "AND ss.stat_date = (SELECT MAX(stat_date) FROM segment_statistics)"
            )
            route_params = {}

        inner_sql = f"""
            SELECT
                rs.seq_id AS id,
                rs.source,
                rs.target,
                CASE
                    WHEN ss.min_width IS NULL     THEN ST_Length(rs.geom::geography)
                    WHEN ss.min_width < {width}   THEN 9999999
                    ELSE                               ST_Length(rs.geom::geography)
                END AS cost,
                CASE
                    WHEN ss.min_width IS NULL     THEN ST_Length(rs.geom::geography)
                    WHEN ss.min_width < {width}   THEN 9999999
                    ELSE                               ST_Length(rs.geom::geography)
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

        try:
            rows = db.execute(
                text(f"""
                    SELECT
                        r.seq,
                        r.cost,
                        rs.name,
                        ss.avg_width
                    FROM pgr_withPoints(:inner_sql, :points_sql, -1, -2,
                                        directed => false) r
                    JOIN road_segments rs ON rs.seq_id = r.edge
                    LEFT JOIN segment_statistics ss
                        ON ss.segment_id = rs.id {outer_date_condition}
                    WHERE r.edge > 0
                    ORDER BY r.seq
                """),
                {"inner_sql": inner_sql, "points_sql": points_sql, **route_params},
            ).fetchall()
        except Exception as e:
            error_msg = str(e)
            if "topology" in error_msg.lower() or "source" in error_msg.lower():
                return {
                    "status": "topology_unavailable",
                    "message": "Road network topology not initialised. Run make setup-routing first.",
                }
            return {"status": "error", "message": error_msg}

        if not rows:
            return {"status": "no_route", "message": "No passable route found between these points."}

        unknown_count = sum(1 for r in rows if r.avg_width is None)
        warnings = []
        if unknown_count:
            warnings.append(
                f"{unknown_count} segment(s) have no width measurements — passability unknown."
            )

        route_segments = [
            {
                "seq": row.seq,
                "name": row.name,
                "avg_width_cm": row.avg_width,
                "passable": (
                    None if row.avg_width is None
                    else row.avg_width >= vehicle_width_cm
                ),
                "cost_m": round(row.cost, 2) if row.cost < 9999999 else None,
            }
            for row in rows
        ]

        total_distance_m = sum(r.cost for r in rows if r.cost < 9999999)

        return {
            "status": "ok",
            "total_distance_m": round(total_distance_m),
            "segment_count": len(rows),
            "vehicle_width_cm": vehicle_width_cm,
            "date": date_obj.isoformat() if date_obj else None,
            "route_segments": route_segments,
            "warnings": warnings,
        }
