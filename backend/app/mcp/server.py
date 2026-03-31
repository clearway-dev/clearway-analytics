# Run with: fastmcp run app/mcp/server.py:mcp --transport sse --port 8001

import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastmcp import FastMCP
from sqlalchemy import inspect, text, func
from sqlalchemy.exc import IntegrityError
from app.database import engine, SessionLocal
from app.services.analytics_service import AnalyticsService
from app.services.dashboard_service import DashboardService
from app.services.ml_service import MLService
from app.models import (
    SegmentStatistics, TargetVehicle, RoadSegment,
    Station, Cluster, CleanedMeasurement,
)
from app.api.endpoints.routing import _find_edge_snap
from datetime import datetime, date
import json

mcp = FastMCP("ClearWay Context")


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Invalid date format '{value}'. Use YYYY-MM-DD.")


def _serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


# ── Developer / schema tools ──────────────────────────────────────────────────

@mcp.tool()
def describe_schema() -> list[dict]:
    """
    Returns the full database schema: every table with its columns, data types,
    nullable flag, primary-key flag, and any foreign-key reference.
    Use this before writing SQL to understand the exact structure.
    """
    insp = inspect(engine)
    tables = []
    for table_name in sorted(insp.get_table_names()):
        pk_cols = set(insp.get_pk_constraint(table_name).get("constrained_columns", []))
        fk_map: dict[str, str] = {}
        for fk in insp.get_foreign_keys(table_name):
            for local_col, ref_col in zip(
                fk["constrained_columns"], fk["referred_columns"]
            ):
                fk_map[local_col] = f"{fk['referred_table']}.{ref_col}"

        columns = []
        for col in insp.get_columns(table_name):
            columns.append({
                "name": col["name"],
                "type": str(col["type"]),
                "nullable": col["nullable"],
                "primary_key": col["name"] in pk_cols,
                "foreign_key": fk_map.get(col["name"]),
            })

        tables.append({"table": table_name, "columns": columns})

    return tables


@mcp.tool()
def run_read_only_sql(query: str) -> list[dict]:
    """
    Executes a read-only SQL query against the database.

    Args:
        query: A SELECT statement. Modification commands (DROP, DELETE, INSERT,
               UPDATE, TRUNCATE) are blocked.

    Returns:
        A list of row dicts. Datetime values are ISO-formatted strings.
    """
    query_str = query.strip()

    if not query_str.upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed.")

    forbidden = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE"]
    if any(kw in query_str.upper() for kw in forbidden):
        raise ValueError("Forbidden SQL keyword detected. Only read-only queries are allowed.")

    with SessionLocal() as db:
        try:
            rows = db.execute(text(query_str)).mappings().all()
            output = []
            for row in rows:
                row_dict = dict(row)
                for key, value in row_dict.items():
                    if isinstance(value, (datetime, date)):
                        row_dict[key] = value.isoformat()
                output.append(row_dict)
            return output
        except Exception as e:
            return [{"error": str(e)}]


# ── Analyst tools ─────────────────────────────────────────────────────────────

@mcp.tool()
def get_available_dates() -> list[str]:
    """
    Returns all dates that have computed segment statistics, newest first.
    Call this first to discover what data is available before making date-scoped queries.
    """
    with SessionLocal() as db:
        return DashboardService(db).get_available_dates()


@mcp.tool()
def get_passability_stats(
    target_date: str | None = None,
    vehicle_width_cm: float = 300.0,
) -> dict:
    """
    Returns network-wide KPI statistics for a given date and vehicle width.

    Args:
        target_date: YYYY-MM-DD. Defaults to the latest available date.
        vehicle_width_cm: Vehicle width in centimetres used to flag critical
                          segments. Default 300 cm (3 m passability threshold).

    Returns:
        total_segments, total_length_km, coverage_percentage, critical_segments_count,
        date-specific measurement counts, and a list of the narrowest road anomalies.
    """
    try:
        date_obj = _parse_date(target_date)
    except ValueError as e:
        return {"error": str(e)}

    with SessionLocal() as db:
        return DashboardService(db).get_global_stats(
            target_date=date_obj, vehicle_width_cm=vehicle_width_cm
        )


@mcp.tool()
def recalculate_daily_stats(target_date: str, force: bool = False) -> dict:
    """
    Deletes and recomputes segment statistics for the given date.

    Args:
        target_date: YYYY-MM-DD date to recompute.
        force: Must be True to overwrite existing statistics. Defaults to False
               as a safety guard against accidental data loss.

    Returns:
        Summary of processed segments and measurements.
    """
    try:
        date_obj = _parse_date(target_date)
    except ValueError as e:
        return {"error": str(e)}

    with SessionLocal() as db:
        if not force:
            existing = db.query(SegmentStatistics).filter(
                SegmentStatistics.stat_date == date_obj
            ).first()
            if existing:
                return {
                    "error": (
                        f"Statistics already exist for {target_date}. "
                        "Pass force=True to overwrite."
                    )
                }

        try:
            AnalyticsService(db).calculate_daily_stats(date_obj)
        except Exception as e:
            return {"error": f"Calculation failed: {str(e)}"}

        stats = db.query(
            func.count(SegmentStatistics.id).label("total_segments"),
            func.avg(SegmentStatistics.avg_width).label("average_width"),
            func.sum(SegmentStatistics.measurements_count).label("total_measurements"),
        ).filter(SegmentStatistics.stat_date == date_obj).first()

        return {
            "status": "ok",
            "date": target_date,
            "processed_segments": stats.total_segments if stats else 0,
            "average_network_width_cm": (
                round(float(stats.average_width), 2)
                if stats and stats.average_width else None
            ),
            "total_measurements_processed": (
                int(stats.total_measurements)
                if stats and stats.total_measurements else 0
            ),
        }


@mcp.tool()
def get_segment_detail(segment_id: str) -> dict:
    """
    Returns detailed information for a single road segment including its full
    measurement history and width distribution histogram.

    Args:
        segment_id: UUID of the road segment.

    Returns:
        Segment metadata, per-date statistics history, and width histogram.
    """
    try:
        import uuid as _uuid
        seg_uuid = _uuid.UUID(segment_id)
    except ValueError:
        return {"error": "Invalid segment ID format — expected a UUID string."}

    with SessionLocal() as db:
        seg = db.query(RoadSegment).filter(RoadSegment.id == seg_uuid).first()
        if not seg:
            return {"error": f"Segment '{segment_id}' not found."}

        history_rows = (
            db.query(SegmentStatistics)
            .filter(SegmentStatistics.segment_id == seg_uuid)
            .order_by(SegmentStatistics.stat_date.desc())
            .all()
        )
        history = [
            {
                "date": row.stat_date.isoformat(),
                "avg_width": row.avg_width,
                "min_width": row.min_width,
                "max_width": row.max_width,
                "measurements_count": row.measurements_count,
                "passable_300cm": (
                    row.avg_width >= 300.0 if row.avg_width is not None else None
                ),
            }
            for row in history_rows
        ]

        histogram = AnalyticsService(db).get_segment_histogram(segment_id)

        return {
            "id": str(seg.id),
            "name": seg.name,
            "osm_id": seg.osm_id,
            "road_type": seg.road_type,
            "history": history,
            "histogram": histogram,
        }


@mcp.tool()
def get_temporal_trends(
    from_date: str,
    to_date: str,
    vehicle_width_cm: float = 300.0,
) -> list[dict]:
    """
    Returns day-by-day network statistics between two dates. Useful for
    identifying trends in coverage, average width, and critical segment counts.

    Args:
        from_date: Start date YYYY-MM-DD (inclusive).
        to_date:   End date YYYY-MM-DD (inclusive).
        vehicle_width_cm: Width threshold for counting critical segments. Default 300 cm.

    Returns:
        List of daily dicts: date, measured_segments, network_avg_width_cm,
        critical_count, total_measurements.
    """
    try:
        from_obj = _parse_date(from_date)
        to_obj = _parse_date(to_date)
    except ValueError as e:
        return [{"error": str(e)}]

    with SessionLocal() as db:
        rows = db.execute(
            text("""
                SELECT
                    stat_date,
                    COUNT(DISTINCT segment_id)                                           AS measured_segments,
                    AVG(avg_width)                                                       AS network_avg_width,
                    COUNT(DISTINCT CASE WHEN avg_width < :width THEN segment_id END)     AS critical_count,
                    SUM(measurements_count)                                              AS total_measurements
                FROM segment_statistics
                WHERE stat_date BETWEEN :from_date AND :to_date
                GROUP BY stat_date
                ORDER BY stat_date
            """),
            {"from_date": from_obj, "to_date": to_obj, "width": vehicle_width_cm},
        ).fetchall()

        return [
            {
                "date": row.stat_date.isoformat(),
                "measured_segments": row.measured_segments,
                "network_avg_width_cm": (
                    round(float(row.network_avg_width), 2)
                    if row.network_avg_width else None
                ),
                "critical_count": row.critical_count,
                "total_measurements": row.total_measurements,
            }
            for row in rows
        ]


@mcp.tool()
def get_data_quality_report(target_date: str | None = None) -> dict:
    """
    Returns measurement quality statistics for a given date (or all-time if omitted).
    Includes quality score distribution and high/low quality counts.

    Args:
        target_date: YYYY-MM-DD. If omitted, aggregates across all dates.

    Returns:
        total_measurements, avg/min quality_score, percentiles (p25/p50/p75),
        high_quality_count (score >= 0.8), low_quality_count (score < 0.5).
    """
    try:
        date_obj = _parse_date(target_date)
    except ValueError as e:
        return {"error": str(e)}

    date_filter = (
        "AND cm.created_at >= :date_from AND cm.created_at < :date_to"
        if date_obj else ""
    )

    with SessionLocal() as db:
        from datetime import timedelta
        params: dict = {}
        if date_obj:
            params["date_from"] = date_obj
            params["date_to"] = date_obj + timedelta(days=1)

        row = db.execute(
            text(f"""
                SELECT
                    COUNT(*)                                                  AS total,
                    AVG(quality_score)                                        AS avg_score,
                    MIN(quality_score)                                        AS min_score,
                    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY quality_score) AS p25,
                    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY quality_score) AS p50,
                    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY quality_score) AS p75,
                    COUNT(*) FILTER (WHERE quality_score >= 0.8)              AS high_quality,
                    COUNT(*) FILTER (WHERE quality_score < 0.5)               AS low_quality
                FROM cleaned_measurements cm
                WHERE quality_score IS NOT NULL
                {date_filter}
            """),
            params,
        ).first()

        if not row or not row.total:
            return {"error": "No quality data found for the specified date."}

        total = int(row.total)
        high = int(row.high_quality)
        low = int(row.low_quality)

        return {
            "date": target_date,
            "total_measurements": total,
            "avg_quality_score": round(float(row.avg_score), 4) if row.avg_score else None,
            "min_quality_score": round(float(row.min_score), 4) if row.min_score else None,
            "percentiles": {
                "p25": round(float(row.p25), 4) if row.p25 else None,
                "p50": round(float(row.p50), 4) if row.p50 else None,
                "p75": round(float(row.p75), 4) if row.p75 else None,
            },
            "high_quality_count": high,
            "low_quality_count": low,
            "high_quality_pct": round(high / total * 100, 1),
            "low_quality_pct": round(low / total * 100, 1),
        }


# ── Dispatch / operator tools ─────────────────────────────────────────────────

@mcp.tool()
def get_vehicles() -> list[dict]:
    """
    Returns all registered target vehicles (emergency service vehicles) with
    their physical dimensions. Use vehicle IDs from this list with
    check_vehicle_passability or find_passable_route.
    """
    with SessionLocal() as db:
        vehicles = (
            db.query(TargetVehicle).order_by(TargetVehicle.name).all()
        )
        return [
            {
                "id": str(v.id),
                "name": v.name,
                "category": v.category,
                "width": v.width,
                "height": v.height,
                "weight": v.weight,
                "length": v.length,
                "turning_diameter_track": v.turning_diameter_track,
                "turning_diameter_clearance": v.turning_diameter_clearance,
                "stabilization_width": v.stabilization_width,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in vehicles
        ]


@mcp.tool()
def get_stations() -> list[dict]:
    """
    Returns all emergency dispatch stations (fire, police, ambulance) with
    their coordinates. Use lat/lon as routing start points in find_passable_route.
    """
    with SessionLocal() as db:
        stations = db.query(Station).order_by(Station.name).all()
        return [
            {
                "id": str(s.id),
                "name": s.name,
                "type": s.type,
                "address": s.address,
                "lat": s.lat,
                "lon": s.lon,
                "notes": s.notes,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in stations
        ]


@mcp.tool()
def check_vehicle_passability(
    vehicle_id: str,
    target_date: str | None = None,
) -> dict:
    """
    Checks whether a specific vehicle can pass through the measured road network.

    Uses the vehicle's effective width (max of width and stabilization_width) to
    identify road segments too narrow to pass. Returns a plain-language verdict.

    Args:
        vehicle_id:  UUID of the target vehicle (from get_vehicles).
        target_date: YYYY-MM-DD. Defaults to the latest available date.

    Returns:
        verdict ("passable" | "blocked" | "data_unavailable"), count of blocked
        segments, and a list of the narrowest blocked roads.
    """
    try:
        import uuid as _uuid
        v_uuid = _uuid.UUID(vehicle_id)
    except ValueError:
        return {"error": "Invalid vehicle_id format — expected a UUID string."}

    try:
        date_obj = _parse_date(target_date)
    except ValueError as e:
        return {"error": str(e)}

    with SessionLocal() as db:
        vehicle = db.query(TargetVehicle).filter(TargetVehicle.id == v_uuid).first()
        if not vehicle:
            return {"error": f"Vehicle '{vehicle_id}' not found."}

        candidates = [
            w for w in [vehicle.width, vehicle.stabilization_width] if w is not None
        ]
        if not candidates:
            return {"error": "Vehicle has no width specification."}
        effective_width = max(candidates)

        service = DashboardService(db)
        resolved_date = date_obj or service._get_latest_date()
        if not resolved_date:
            return {
                "vehicle": {"id": vehicle_id, "name": vehicle.name},
                "verdict": "data_unavailable",
                "message": "No segment statistics exist in the database yet.",
            }

        critical_count = service.get_critical_count(resolved_date, effective_width)
        blocked = service.get_critical_segments(resolved_date, effective_width, limit=20)

        return {
            "vehicle": {
                "id": vehicle_id,
                "name": vehicle.name,
                "category": vehicle.category,
                "width_cm": vehicle.width,
                "effective_width_cm": effective_width,
            },
            "date": resolved_date.isoformat(),
            "verdict": "passable" if critical_count == 0 else "blocked",
            "critical_segments_count": critical_count,
            "blocked_segments": blocked,
        }


@mcp.tool()
def get_obstacles(
    target_date: str | None = None,
    min_lat: float | None = None,
    min_lon: float | None = None,
    max_lat: float | None = None,
    max_lon: float | None = None,
) -> list[dict]:
    """
    Returns pre-computed DBSCAN obstacle clusters (narrow-point detections) for
    a given date and optional bounding box.

    Args:
        target_date: YYYY-MM-DD. Defaults to the latest date with cluster data.
        min_lat, min_lon, max_lat, max_lon: Optional bounding box filter.

    Returns:
        List of obstacle clusters with lat, lon, severity (critical/high/medium),
        cluster_size, avg_width, and min_width (all widths in cm).
    """
    try:
        date_obj = _parse_date(target_date)
    except ValueError as e:
        return [{"error": str(e)}]

    with SessionLocal() as db:
        if date_obj is None:
            date_obj = db.query(func.max(Cluster.stat_date)).scalar()
        if date_obj is None:
            return []

        return MLService(db).detect_obstacles(date_obj, min_lon, min_lat, max_lon, max_lat)


@mcp.tool()
def get_road_features_in_bbox(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    target_date: str | None = None,
    include_stats: bool = True,
) -> list[dict]:
    """
    Returns road segments within a bounding box, optionally enriched with
    passability statistics.

    Args:
        min_lat, min_lon, max_lat, max_lon: Bounding box in WGS-84 degrees.
        target_date:   YYYY-MM-DD. If omitted, uses the latest available date
                       per segment.
        include_stats: If True (default), attaches avg_width, min_width,
                       measurements_count and status to each feature.

    Returns:
        GeoJSON-compatible Feature list, limit 100.
    """
    if include_stats:
        if target_date:
            date_join = "AND ss.stat_date = :target_date"
            params: dict = {
                "min_lon": min_lon, "min_lat": min_lat,
                "max_lon": max_lon, "max_lat": max_lat,
                "target_date": target_date,
            }
        else:
            date_join = (
                "AND ss.stat_date = "
                "(SELECT MAX(s2.stat_date) FROM segment_statistics s2 "
                " WHERE s2.segment_id = rs.id)"
            )
            params = {
                "min_lon": min_lon, "min_lat": min_lat,
                "max_lon": max_lon, "max_lat": max_lat,
            }

        query = text(f"""
            SELECT
                rs.id,
                rs.name,
                rs.road_type,
                ST_AsGeoJSON(rs.geom) AS geom_json,
                ss.avg_width,
                ss.min_width,
                ss.max_width,
                ss.measurements_count,
                ss.stat_date
            FROM road_segments rs
            LEFT JOIN segment_statistics ss
                ON ss.segment_id = rs.id {date_join}
            WHERE rs.geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
            LIMIT 100
        """)
    else:
        query = text("""
            SELECT
                rs.id,
                rs.name,
                rs.road_type,
                ST_AsGeoJSON(rs.geom) AS geom_json,
                NULL AS avg_width,
                NULL AS min_width,
                NULL AS max_width,
                NULL AS measurements_count,
                NULL AS stat_date
            FROM road_segments rs
            WHERE rs.geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
            LIMIT 100
        """)
        params = {
            "min_lon": min_lon, "min_lat": min_lat,
            "max_lon": max_lon, "max_lat": max_lat,
        }

    with SessionLocal() as db:
        rows = db.execute(query, params).fetchall()

    features = []
    for row in rows:
        avg_w = row.avg_width
        status = (
            "no_data" if avg_w is None
            else "ok" if avg_w >= 300.0
            else "narrow"
        )
        features.append({
            "type": "Feature",
            "properties": {
                "id": str(row.id),
                "name": row.name,
                "road_type": row.road_type,
                "avg_width": avg_w,
                "min_width": row.min_width,
                "max_width": row.max_width,
                "measurements_count": row.measurements_count,
                "stat_date": row.stat_date.isoformat() if row.stat_date else None,
                "status": status,
            },
            "geometry": json.loads(row.geom_json),
        })

    return features


@mcp.tool()
def find_passable_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    vehicle_width_cm: float = 300.0,
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
                    WHEN ss.avg_width IS NULL     THEN ST_Length(rs.geom::geography)
                    WHEN ss.avg_width < {width}   THEN 9999999
                    ELSE                               ST_Length(rs.geom::geography)
                END AS cost,
                CASE
                    WHEN ss.avg_width IS NULL     THEN ST_Length(rs.geom::geography)
                    WHEN ss.avg_width < {width}   THEN 9999999
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


# ── Vehicle management ────────────────────────────────────────────────────────

@mcp.tool()
def create_vehicle(
    name: str,
    category: str | None = None,
    width: int | None = None,
    height: int | None = None,
    weight: float | None = None,
    length: int | None = None,
    turning_diameter_track: int | None = None,
    turning_diameter_clearance: int | None = None,
    stabilization_width: int | None = None,
) -> dict:
    """
    Inserts a new vehicle into the target_vehicles table.

    All numeric fields are in SI units:
      - width, height, length, turning_diameter_track,
        turning_diameter_clearance, stabilization_width  → centimetres (INTEGER)
      - weight → tonnes

    Args:
        name: Vehicle name, e.g. "CAS 24 SCANIA" (required).
        category: Free-text category, e.g. "Cisterna", "Žebřík".
        width: Vehicle width in centimetres.
        height: Vehicle height in centimetres.
        weight: Vehicle weight in tonnes.
        length: Vehicle length in centimetres.
        turning_diameter_track: Track turning diameter in centimetres.
        turning_diameter_clearance: Clearance turning diameter in centimetres.
        stabilization_width: Width with stabilisers extended in centimetres.

    Returns:
        The saved vehicle record as a dict, including its generated id.
    """
    with SessionLocal() as db:
        vehicle = TargetVehicle(
            name=name,
            category=category,
            width=width,
            height=height,
            weight=weight,
            length=length,
            turning_diameter_track=turning_diameter_track,
            turning_diameter_clearance=turning_diameter_clearance,
            stabilization_width=stabilization_width,
        )
        db.add(vehicle)
        db.commit()
        db.refresh(vehicle)
        return {
            "id": str(vehicle.id),
            "name": vehicle.name,
            "category": vehicle.category,
            "width": vehicle.width,
            "height": vehicle.height,
            "weight": vehicle.weight,
            "length": vehicle.length,
            "turning_diameter_track": vehicle.turning_diameter_track,
            "turning_diameter_clearance": vehicle.turning_diameter_clearance,
            "stabilization_width": vehicle.stabilization_width,
            "created_at": vehicle.created_at.isoformat() if vehicle.created_at else None,
        }
