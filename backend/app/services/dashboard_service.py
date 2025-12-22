from sqlalchemy.orm import Session
from sqlalchemy import func, cast, distinct
from geoalchemy2 import Geography
from app.models import RoadSegment, CleanedMeasurement, SegmentStatistics

class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def get_global_stats(self):
        """
        Calculates global KPI statistics for the dashboard.
        """
        # 1. Total Segments
        total_segments = self.db.query(func.count(RoadSegment.id)).scalar() or 0

        # 2. Total Measurements
        total_measurements = self.db.query(func.count(CleanedMeasurement.id)).scalar() or 0

        # 3. Total Length in KM
        # ST_Length on Geography returns meters. Divide by 1000 for km.
        total_length_meters = self.db.query(
            func.sum(func.ST_Length(cast(RoadSegment.geom, Geography)))
        ).scalar() or 0.0
        total_length_km = round(total_length_meters / 1000.0, 1)

        # 4. Measured Segments Count (unique segments that have stats)
        measured_segments_count = self.db.query(
            func.count(distinct(SegmentStatistics.segment_id))
        ).scalar() or 0

        return {
            "total_segments": total_segments,
            "total_measurements": total_measurements,
            "total_length_km": total_length_km,
            "measured_segments_count": measured_segments_count
        }
