from sqlalchemy.orm import Session
from sqlalchemy import func, cast, distinct
from geoalchemy2 import Geography
from app.models import RoadSegment, CleanedMeasurement, SegmentStatistics
import json


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def _get_latest_date(self):
        return self.db.query(func.max(SegmentStatistics.stat_date)).scalar()

    def get_coverage_map_data(self):
        """
        Returns GeoJSON of road segments showing measurement intensity.
        Only returns segments with > 0 measurements.
        """
        results = self.db.query(
            RoadSegment.id,
            func.sum(SegmentStatistics.measurements_count).label("total_count"),
            func.ST_AsGeoJSON(RoadSegment.geom).label("geometry")
        ).join(
            SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
        ).group_by(
            RoadSegment.id
        ).having(
            func.sum(SegmentStatistics.measurements_count) > 0
        ).all()

        features = []
        for row in results:
            features.append({
                "type": "Feature",
                "geometry": json.loads(row.geometry),
                "properties": {
                    "id": str(row.id),
                    "intensity": row.total_count
                }
            })

        return {"type": "FeatureCollection", "features": features}

    def get_available_dates(self):
        """
        Returns a list of dates that have statistical data available.
        """
        results = self.db.query(
            distinct(SegmentStatistics.stat_date)
        ).order_by(
            SegmentStatistics.stat_date.desc()
        ).all()

        return [str(r[0]) for r in results]

    def get_critical_count(self, target_date=None, vehicle_width_cm: float = 300.0) -> int:
        """
        Returns count of segments where min_width < vehicle_width_cm for the given date.
        """
        stat_date = target_date or self._get_latest_date()
        if not stat_date:
            return 0
        return self.db.query(
            func.count(distinct(SegmentStatistics.segment_id))
        ).filter(
            SegmentStatistics.stat_date == stat_date,
            SegmentStatistics.min_width < vehicle_width_cm,
            SegmentStatistics.min_width.isnot(None),
        ).scalar() or 0

    def get_critical_segments(self, target_date=None, vehicle_width_cm: float = 300.0, limit: int = 5):
        """
        Returns the top narrowest segments for the given date, ordered by min_width ASC.
        """
        stat_date = target_date or self._get_latest_date()
        if not stat_date:
            return []

        results = self.db.query(
            RoadSegment.id,
            RoadSegment.name,
            SegmentStatistics.min_width,
            SegmentStatistics.avg_width,
            SegmentStatistics.measurements_count,
            func.ST_Y(func.ST_Centroid(RoadSegment.geom)).label("lat"),
            func.ST_X(func.ST_Centroid(RoadSegment.geom)).label("lon"),
            SegmentStatistics.stat_date
        ).join(
            SegmentStatistics, RoadSegment.id == SegmentStatistics.segment_id
        ).filter(
            SegmentStatistics.stat_date == stat_date,
            SegmentStatistics.min_width.isnot(None),
        ).order_by(
            SegmentStatistics.min_width.asc()
        ).limit(limit).all()

        return [
            {
                "id": str(r.id),
                "name": r.name or "Unknown Road",
                "min_width": r.min_width,
                "avg_width": r.avg_width,
                "measurements_count": r.measurements_count,
                "lat": r.lat,
                "lon": r.lon,
                "date": str(r.stat_date)
            }
            for r in results
        ]

    def get_global_stats(self, target_date=None, vehicle_width_cm: float = 300.0):
        """
        Calculates global KPI statistics for the dashboard.
        """
        total_segments = self.db.query(func.count(RoadSegment.id)).scalar() or 0
        total_measurements = self.db.query(func.count(CleanedMeasurement.id)).scalar() or 0

        total_length_meters = self.db.query(
            func.sum(func.ST_Length(cast(RoadSegment.geom, Geography)))
        ).scalar() or 0.0
        total_length_km = round(total_length_meters / 1000.0, 1)

        measured_segments_count = self.db.query(
            func.count(distinct(SegmentStatistics.segment_id))
        ).scalar() or 0

        coverage_percentage = round(
            measured_segments_count / total_segments * 100, 1
        ) if total_segments > 0 else 0.0

        critical_segments_count = self.get_critical_count(target_date, vehicle_width_cm)

        return {
            "total_segments": total_segments,
            "total_measurements": total_measurements,
            "total_length_km": total_length_km,
            "measured_segments_count": measured_segments_count,
            "coverage_percentage": coverage_percentage,
            "critical_segments_count": critical_segments_count,
            "anomalies": self.get_critical_segments(target_date, vehicle_width_cm),
        }
