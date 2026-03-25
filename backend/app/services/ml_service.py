from datetime import date
from typing import Optional

import numpy as np
from sklearn.cluster import DBSCAN
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import CleanedMeasurement


class MLService:
    def __init__(self, db: Session):
        self.db = db

    def detect_obstacles(
        self,
        target_date: date,
        min_lon: Optional[float] = None,
        min_lat: Optional[float] = None,
        max_lon: Optional[float] = None,
        max_lat: Optional[float] = None,
    ):
        """
        Detects clusters of narrow width measurements using DBSCAN.
        Returns a list of obstacle centroids with severity, cluster_size, and avg_width.
        """
        # Fetch coordinates and width for all narrow measurements on the given date
        query = self.db.query(
            func.ST_Y(CleanedMeasurement.geom).label("lat"),
            func.ST_X(CleanedMeasurement.geom).label("lon"),
            CleanedMeasurement.cleaned_width,
        ).filter(
            func.date(CleanedMeasurement.created_at) == target_date,
            CleanedMeasurement.cleaned_width < 300.0,
        )

        # Apply optional bounding box filter to reduce data volume
        if all(v is not None for v in [min_lon, min_lat, max_lon, max_lat]):
            query = query.filter(
                func.ST_Within(
                    CleanedMeasurement.geom,
                    func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
                )
            )

        results = query.all()

        if len(results) < 10:
            return []

        coords = np.array([(r.lat, r.lon) for r in results])
        widths = np.array([r.cleaned_width for r in results])

        # eps ≈ 10 metres converted to degrees (1 degree ≈ 111 320 m)
        EPSILON = 10.0 / 111320.0
        MIN_SAMPLES = 4

        dbscan = DBSCAN(eps=EPSILON, min_samples=MIN_SAMPLES, metric="euclidean")
        dbscan.fit(coords)

        labels = dbscan.labels_
        obstacles = []

        for label in set(labels):
            if label == -1:
                # Skip noise points
                continue

            cluster_mask = labels == label
            cluster_points = coords[cluster_mask]
            cluster_widths = widths[cluster_mask]

            centroid = np.mean(cluster_points, axis=0)
            avg_width_cm = float(np.mean(cluster_widths))
            avg_width_m = avg_width_cm / 100.0

            # Severity based on average cluster width in metres
            if avg_width_m < 2.0:
                severity = "critical"
            elif avg_width_m <= 2.5:
                severity = "high"
            else:
                severity = "medium"

            obstacles.append({
                "lat": float(centroid[0]),
                "lon": float(centroid[1]),
                "severity": severity,
                "cluster_size": int(len(cluster_points)),
                "avg_width": round(avg_width_m, 2),
            })

        return obstacles
