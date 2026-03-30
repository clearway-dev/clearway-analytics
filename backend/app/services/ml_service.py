from datetime import date
from typing import Optional

from geoalchemy2 import Geography
from sqlalchemy import cast, func
from sqlalchemy.orm import Session

from app.models import Cluster


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
        Returns pre-computed DBSCAN obstacle clusters for the given date.
        Optionally filters by bounding box.
        """
        q = self.db.query(
            func.ST_Y(Cluster.geom).label("lat"),
            func.ST_X(Cluster.geom).label("lon"),
            Cluster.severity,
            Cluster.cluster_size,
            Cluster.avg_width,
            Cluster.min_width,
        ).filter(Cluster.stat_date == target_date)

        if all(v is not None for v in [min_lon, min_lat, max_lon, max_lat]):
            q = q.filter(
                func.ST_Within(
                    Cluster.geom,
                    func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326),
                )
            )

        results = q.all()

        return [
            {
                "lat": r.lat,
                "lon": r.lon,
                "severity": r.severity,
                "cluster_size": r.cluster_size,
                "avg_width": r.avg_width,
                "min_width": r.min_width,
            }
            for r in results
        ]
