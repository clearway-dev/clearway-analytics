import logging
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, String, text
from datetime import date
from app.models import RoadSegment, SegmentStatistics
from app.core.constants import SNAP_DISTANCE_DEG, PASSABILITY_THRESHOLD_M

log = logging.getLogger(__name__)

HISTOGRAM_BIN_WIDTH_CM = 25
HISTOGRAM_MAX_WIDTH_CM = 1000
HISTOGRAM_BUCKET_COUNT = HISTOGRAM_MAX_WIDTH_CM // HISTOGRAM_BIN_WIDTH_CM


class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def calculate_daily_stats(self, target_date: date) -> None:
        """Compute per-segment width statistics for *target_date*.

        Each measurement is assigned to the single nearest road segment within
        SNAP_DISTANCE_M using a PostGIS LATERAL join (mirrors the previous
        GeoPandas sjoin_nearest logic but runs entirely inside the database).
        Existing stats for the date are deleted before inserting new ones so
        the method is safe to re-run.
        """
        log.info("Calculating statistics for date: %s", target_date)

        # Remove stale stats for this date so re-runs produce correct results.
        self.db.execute(
            text("DELETE FROM segment_statistics WHERE stat_date = :d"),
            {"d": target_date},
        )

        # Assign each measurement to its nearest segment within SNAP_DISTANCE_M,
        # then aggregate — entirely in PostGIS, no data loaded into Python memory.
        result = self.db.execute(
            text("""
                WITH nearest AS (
                    SELECT DISTINCT ON (cm.id)
                        rs.id          AS segment_id,
                        cm.cleaned_width
                    FROM cleaned_measurements cm
                    CROSS JOIN LATERAL (
                        SELECT rs.id
                        FROM road_segments rs
                        WHERE ST_DWithin(cm.geom, rs.geom, :snap_deg)
                        ORDER BY cm.geom <-> rs.geom
                        LIMIT 1
                    ) rs
                    WHERE cm.created_at >= :target_date
                      AND cm.created_at <  :target_date + INTERVAL '1 day'
                )
                SELECT
                    segment_id,
                    AVG(cleaned_width)  AS avg_width,
                    MIN(cleaned_width)  AS min_width,
                    MAX(cleaned_width)  AS max_width,
                    COUNT(*)            AS measurements_count
                FROM nearest
                GROUP BY segment_id
            """),
            {"target_date": target_date, "snap_deg": SNAP_DISTANCE_DEG},
        )

        rows = result.fetchall()

        if not rows:
            log.info("No measurements found for %s — nothing stored.", target_date)
            return

        log.info("Storing statistics for %d road segments.", len(rows))

        for row in rows:
            self.db.add(
                SegmentStatistics(
                    segment_id=row.segment_id,
                    stat_date=target_date,
                    avg_width=round(float(row.avg_width), 2),
                    min_width=round(float(row.min_width), 2),
                    max_width=round(float(row.max_width), 2),
                    measurements_count=int(row.measurements_count),
                )
            )

        self.db.commit()
        log.info("Statistics calculation complete for %s.", target_date)

    def get_segment_histogram(self, segment_id: str) -> list[dict]:
        """Return width distribution for a segment as 25 cm bins using SQL WIDTH_BUCKET."""
        rows = self.db.execute(
            text(f"""
                WITH seg AS (
                    SELECT geom FROM road_segments WHERE id = :segment_id
                ),
                bucketed AS (
                    SELECT WIDTH_BUCKET(cm.cleaned_width, 0, {HISTOGRAM_MAX_WIDTH_CM}, {HISTOGRAM_BUCKET_COUNT}) AS bucket
                    FROM cleaned_measurements cm, seg
                    WHERE ST_DWithin(cm.geom, seg.geom, :snap_deg)
                      AND cm.cleaned_width BETWEEN 0 AND {HISTOGRAM_MAX_WIDTH_CM}
                )
                SELECT
                    (bucket - 1) * {HISTOGRAM_BIN_WIDTH_CM}  AS min,
                    bucket * {HISTOGRAM_BIN_WIDTH_CM}         AS max,
                    COUNT(*)           AS count
                FROM bucketed
                GROUP BY bucket
                ORDER BY bucket
            """),
            {"segment_id": segment_id, "snap_deg": SNAP_DISTANCE_DEG},
        ).fetchall()

        return [
            {"range": f"{row.min} - {row.max}", "count": int(row.count), "min": int(row.min)}
            for row in rows
        ]

    def get_road_segments(self, target_date: date) -> dict:
        """Return GeoJSON FeatureCollection of road segments with statistics for a given date."""
        import json
        results = self.db.query(
            RoadSegment.id,
            RoadSegment.name,
            SegmentStatistics.avg_width,
            SegmentStatistics.min_width,
            SegmentStatistics.max_width,
            SegmentStatistics.measurements_count,
            func.ST_AsGeoJSON(RoadSegment.geom).label("geometry"),
        ).join(
            SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
        ).filter(
            SegmentStatistics.stat_date == target_date
        ).all()

        features = []
        for row in results:
            status = "ok" if row.avg_width >= PASSABILITY_THRESHOLD_M else "narrow"
            features.append({
                "type": "Feature",
                "geometry": json.loads(row.geometry),
                "properties": {
                    "segment_id": str(row.id),
                    "name": row.name if row.name and row.name != "nan" else None,
                    "avg_width": row.avg_width,
                    "min_width": row.min_width,
                    "max_width": row.max_width,
                    "measurements_count": row.measurements_count,
                    "status": status,
                },
            })
        return {"type": "FeatureCollection", "features": features}

    def search_roads(self, q: str) -> list[dict]:
        """Search road segments by name; returns top 10 unique names with centroids."""
        results = self.db.query(
            func.max(cast(RoadSegment.id, String)).label("id"),
            RoadSegment.name,
            func.ST_Y(func.ST_Centroid(func.ST_Collect(RoadSegment.geom))).label("lat"),
            func.ST_X(func.ST_Centroid(func.ST_Collect(RoadSegment.geom))).label("lon"),
        ).filter(
            RoadSegment.name.ilike(f"%{q}%")
        ).group_by(
            RoadSegment.name
        ).limit(10).all()

        return [
            {
                "id": str(row.id),
                "name": row.name if row.name and row.name != "nan" else None,
                "center_lat": row.lat,
                "center_lon": row.lon,
            }
            for row in results
        ]

    def get_sessions_for_date(self, target_date: date) -> list[dict]:
        """Return measurement sessions that collected data on the given date."""
        rows = self.db.execute(
            text("""
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
