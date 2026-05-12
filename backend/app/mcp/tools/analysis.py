import json
from fastmcp import FastMCP
from sqlalchemy import func, text
from app.database import SessionLocal
from app.models import TargetVehicle, Cluster
from app.services.dashboard_service import DashboardService
from app.services.ml_service import MLService
from app.core.constants import PASSABILITY_THRESHOLD_CM
from app.mcp._helpers import _parse_date

analysis_server = FastMCP("ClearWay Analysis")


@analysis_server.tool()
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


@analysis_server.tool()
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


@analysis_server.tool()
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
            else "ok" if avg_w >= PASSABILITY_THRESHOLD_CM
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
