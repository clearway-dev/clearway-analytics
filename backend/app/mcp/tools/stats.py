from fastmcp import FastMCP
from sqlalchemy import func, text
from app.database import SessionLocal
from app.models import SegmentStatistics, RoadSegment
from app.services.analytics_service import AnalyticsService
from app.services.dashboard_service import DashboardService
from app.core.constants import PASSABILITY_THRESHOLD_CM
from app.mcp._helpers import _parse_date

stats_server = FastMCP("ClearWay Stats")


@stats_server.tool()
def get_available_dates() -> list[str]:
    """
    Returns all dates that have computed segment statistics, newest first.
    Call this first to discover what data is available before making date-scoped queries.
    """
    with SessionLocal() as db:
        return DashboardService(db).get_available_dates()


@stats_server.tool()
def get_passability_stats(
    target_date: str | None = None,
    vehicle_width_cm: float = PASSABILITY_THRESHOLD_CM,
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


@stats_server.tool()
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


@stats_server.tool()
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
                    row.avg_width >= PASSABILITY_THRESHOLD_CM if row.avg_width is not None else None
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


@stats_server.tool()
def get_temporal_trends(
    from_date: str,
    to_date: str,
    vehicle_width_cm: float = PASSABILITY_THRESHOLD_CM,
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


@stats_server.tool()
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
