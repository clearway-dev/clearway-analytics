import logging
from sqlalchemy.orm import Session
from datetime import date
from sqlalchemy import text
from app.models import SegmentStatistics

log = logging.getLogger(__name__)

# Maximum distance (metres) for assigning a measurement to a road segment.
SNAP_DISTANCE_M = 10


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
                        WHERE ST_DWithin(cm.geom::geography, rs.geom::geography, :snap_m)
                        ORDER BY cm.geom <-> rs.geom
                        LIMIT 1
                    ) rs
                    WHERE DATE(cm.created_at) = :target_date
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
            {"target_date": target_date, "snap_m": SNAP_DISTANCE_M},
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
            text("""
                WITH seg AS (
                    SELECT geom FROM road_segments WHERE id = :segment_id
                ),
                bucketed AS (
                    SELECT WIDTH_BUCKET(cm.cleaned_width, 0, 1000, 40) AS bucket
                    FROM cleaned_measurements cm, seg
                    WHERE ST_DWithin(cm.geom::geography, seg.geom::geography, 10)
                      AND cm.cleaned_width BETWEEN 0 AND 1000
                )
                SELECT
                    (bucket - 1) * 25  AS min,
                    bucket * 25        AS max,
                    COUNT(*)           AS count
                FROM bucketed
                GROUP BY bucket
                ORDER BY bucket
            """),
            {"segment_id": segment_id},
        ).fetchall()

        return [
            {"range": f"{row.min} - {row.max}", "count": int(row.count), "min": int(row.min)}
            for row in rows
        ]
