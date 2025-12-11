from sqlalchemy.orm import Session
from datetime import date
import geopandas as gpd
from sqlalchemy import text, select, cast, func
from app.models import SegmentStatistics, RoadSegment, CleanedMeasurement
from geoalchemy2 import Geography


class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def calculate_daily_stats(self, target_date: date):
        print(f"Calculating statistics for date: {target_date}")

        print("Loading road segments from database...")
        sql_roads = "SELECT id, osm_id, geom FROM road_segments"
        gdf_roads = gpd.read_postgis(sql_roads, self.db.connection(), geom_col="geom")
        gdf_roads.set_crs(epsg=4326, allow_override=True, inplace=True)

        print("Loading measurements from database...")
        sql_measurements = text(f"""
            SELECT id, cleaned_width, geom
            FROM cleaned_measurements
            WHERE DATE(created_at) = '{target_date}'
        """)
        gdf_measurements = gpd.read_postgis(
            sql_measurements, self.db.connection(), geom_col="geom"
        )
        gdf_measurements.set_crs(epsg=4326, allow_override=True, inplace=True)

        if gdf_measurements.empty:
            print("No measurements found for the given date.")
            return

        print(
            f"Found {len(gdf_measurements)} measurements and {len(gdf_roads)} road segments. Performing spatial join with road segments..."
        )

        gdf_measurements = gdf_measurements.to_crs(epsg=3857)
        gdf_roads = gdf_roads.to_crs(epsg=3857)

        print("Performing spatial join...")

        matched = gpd.sjoin_nearest(
            gdf_measurements,
            gdf_roads,
            how="inner",
            distance_col="dist",
            max_distance=10,
        )

        print(f"Spatial join completed. Found {len(matched)} matched measurements.")

        stats = (
            matched.groupby("id_right")["cleaned_width"]
            .agg(
                avg_width="mean",
                min_width="min",
                max_width="max",
                measurements_count="count",
            )
            .reset_index()
        )

        print(f"Storing statistics for {len(stats)} road segments in the database...")

        for _, row in stats.iterrows():
            stat_record = SegmentStatistics(
                segment_id=row["id_right"],
                stat_date=target_date,
                avg_width=round(row["avg_width"], 2),
                min_width=round(row["min_width"], 2),
                max_width=round(row["max_width"], 2),
                measurements_count=int(row["measurements_count"]),
            )
            self.db.add(stat_record)

        self.db.commit()
        print("Statistics calculation and storage completed.")

    def get_segment_histogram(self, segment_id: str):
        print(f"Generating histogram for segment ID: {segment_id}")

        segment_geom_subquery = (
            select(RoadSegment.geom)
            .where(RoadSegment.id == segment_id)
            .scalar_subquery()
        )

        stmt_measurements = select(CleanedMeasurement.cleaned_width).filter(
            func.ST_DWithin(
                cast(CleanedMeasurement.geom, Geography),
                cast(segment_geom_subquery, Geography),
                10,
            )
        )

        widths = self.db.scalars(stmt_measurements).all()

        if not widths:
            return []

        bins = list(range(0, 1001, 25))

        histogram_data = []

        for i in range(len(bins) - 1):
            lower = bins[i]
            upper = bins[i + 1]
            count = sum(1 for w in widths if lower <= w < upper)
            histogram_data.append(
                {"range": f"{lower} - {upper}", "count": count, "min": lower}
            )

        return histogram_data
