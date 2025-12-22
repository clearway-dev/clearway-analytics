from sqlalchemy.orm import Session
from sqlalchemy import func, cast, distinct
from geoalchemy2 import Geography
from app.models import RoadSegment, CleanedMeasurement, SegmentStatistics
from datetime import date, timedelta
import json

class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def get_coverage_map_data(self):
        """
        Returns GeoJSON of road segments showing measurement intensity.
        Only returns segments with > 0 measurements.
        """
        # Aggregate measurements count per segment across all dates
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

        return {
            "type": "FeatureCollection",
            "features": features
        }

    def get_activity_chart_data(self):
        """
        Returns measurement count grouped by day for the last 7 days.
        """
        end_date = date.today()
        start_date = end_date - timedelta(days=6)
        
        results = self.db.query(
            func.date(CleanedMeasurement.created_at).label('date'),
            func.count(CleanedMeasurement.id).label('count')
        ).filter(
            CleanedMeasurement.created_at >= start_date
        ).group_by(
            func.date(CleanedMeasurement.created_at)
        ).order_by('date').all()

        return [{"date": str(r.date), "count": r.count} for r in results]

    def get_quality_pie_data(self):
        """
        Returns distribution of road quality (Passable vs Critical)
        based on the latest statistics.
        Passable >= 3.0m (300cm).
        """
        latest_date = self.db.query(func.max(SegmentStatistics.stat_date)).scalar()
        if not latest_date:
            return []
            
        passable_count = self.db.query(func.count(SegmentStatistics.id)).filter(
            SegmentStatistics.stat_date == latest_date,
            SegmentStatistics.avg_width >= 300.0
        ).scalar() or 0
        
        critical_count = self.db.query(func.count(SegmentStatistics.id)).filter(
            SegmentStatistics.stat_date == latest_date,
            SegmentStatistics.avg_width < 300.0
        ).scalar() or 0
        
        return [
            {"name": "Passable", "value": passable_count},
            {"name": "Critical", "value": critical_count}
        ]

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
            "measured_segments_count": measured_segments_count,
            "activity_chart": self.get_activity_chart_data(),
            "quality_chart": self.get_quality_pie_data()
        }
