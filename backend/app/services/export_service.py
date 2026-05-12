from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional

from app.models import RoadSegment, SegmentStatistics
from app.core.constants import PASSABILITY_THRESHOLD_M


class ExportService:
    def __init__(self, db: Session):
        self.db = db

    def get_preview(
        self,
        mode: str,
        target_date: Optional[date],
        from_date: Optional[date],
        to_date: Optional[date],
    ) -> dict:
        """Return segment count and date coverage for the given export configuration."""
        if mode == "single":
            target = target_date or date.today()
            count = self.db.query(func.count(SegmentStatistics.id)).filter(
                SegmentStatistics.stat_date == target
            ).scalar()
            return {
                "segment_count": count or 0,
                "date_from": str(target),
                "date_to": str(target),
                "days_with_data": 1 if (count or 0) > 0 else 0,
            }

        q = self.db.query(
            func.count(func.distinct(SegmentStatistics.segment_id)).label("segment_count"),
            func.min(SegmentStatistics.stat_date).label("date_from"),
            func.max(SegmentStatistics.stat_date).label("date_to"),
            func.count(func.distinct(SegmentStatistics.stat_date)).label("days_with_data"),
        )
        if mode == "range":
            if from_date:
                q = q.filter(SegmentStatistics.stat_date >= from_date)
            if to_date:
                q = q.filter(SegmentStatistics.stat_date <= to_date)

        result = q.one()
        return {
            "segment_count": result.segment_count or 0,
            "date_from": str(result.date_from) if result.date_from else None,
            "date_to": str(result.date_to) if result.date_to else None,
            "days_with_data": result.days_with_data or 0,
        }

    def get_export_data(
        self,
        mode: str,
        target_date: Optional[date],
        from_date: Optional[date],
        to_date: Optional[date],
    ) -> tuple[list[dict], str]:
        """Query DB and return (rows_data, filename_suffix).

        rows_data dicts contain normalised fields plus a 'geometry' GeoJSON string
        ready for any downstream formatter (GeoJSON, CSV, Shapefile).
        """
        if mode == "single":
            target = target_date or date.today()
            results = self.db.query(
                RoadSegment.id,
                RoadSegment.osm_id,
                RoadSegment.name,
                RoadSegment.road_type,
                SegmentStatistics.avg_width,
                SegmentStatistics.min_width,
                SegmentStatistics.max_width,
                SegmentStatistics.measurements_count,
                SegmentStatistics.stat_date.label("date_from"),
                SegmentStatistics.stat_date.label("date_to"),
                func.ST_AsGeoJSON(RoadSegment.geom).label("geometry"),
            ).join(
                SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
            ).filter(
                SegmentStatistics.stat_date == target
            ).all()
            filename_suffix = str(target)
        else:
            q = self.db.query(
                RoadSegment.id,
                RoadSegment.osm_id,
                RoadSegment.name,
                RoadSegment.road_type,
                (func.sum(SegmentStatistics.avg_width * SegmentStatistics.measurements_count) /
                 func.nullif(func.sum(SegmentStatistics.measurements_count), 0)).label("avg_width"),
                func.min(SegmentStatistics.min_width).label("min_width"),
                func.max(SegmentStatistics.max_width).label("max_width"),
                func.sum(SegmentStatistics.measurements_count).label("measurements_count"),
                func.min(SegmentStatistics.stat_date).label("date_from"),
                func.max(SegmentStatistics.stat_date).label("date_to"),
                func.ST_AsGeoJSON(RoadSegment.geom).label("geometry"),
            ).join(
                SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
            )
            if mode == "range":
                if from_date:
                    q = q.filter(SegmentStatistics.stat_date >= from_date)
                if to_date:
                    q = q.filter(SegmentStatistics.stat_date <= to_date)
            results = q.group_by(
                RoadSegment.id,
                RoadSegment.osm_id,
                RoadSegment.name,
                RoadSegment.road_type,
                RoadSegment.geom,
            ).all()
            filename_suffix = f"{from_date}_to_{to_date}" if mode == "range" else "all_time"

        rows = []
        for row in results:
            avg = round(float(row.avg_width), 2) if row.avg_width is not None else None
            rows.append({
                "segment_id": str(row.id),
                "osm_id": row.osm_id,
                "name": row.name if row.name and row.name != "nan" else None,
                "road_type": row.road_type,
                "avg_width": avg,
                "min_width": row.min_width,
                "max_width": row.max_width,
                "measurements_count": int(row.measurements_count) if row.measurements_count else 0,
                "status": "ok" if (avg or 0) >= PASSABILITY_THRESHOLD_M else "narrow",
                "date_from": str(row.date_from),
                "date_to": str(row.date_to),
                "geometry": row.geometry,
            })

        return rows, filename_suffix
