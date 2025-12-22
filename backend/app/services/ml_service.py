from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import CleanedMeasurement
from datetime import date
from sklearn.cluster import DBSCAN
import numpy as np

class MLService:
    def __init__(self, db: Session):
        self.db = db

    def detect_obstacles(self, target_date: date):
        """
        Detects clusters of narrow width measurements using DBSCAN algorithm.
        Returns a list of obstacle centroids.
        """
        # 1. Fetch data: Points with width < 300cm for the given date
        # We need to filter by date. Since CleanedMeasurement has 'created_at' (DateTime),
        # we cast it to Date.
        query = self.db.query(
            func.ST_Y(CleanedMeasurement.geom).label("lat"),
            func.ST_X(CleanedMeasurement.geom).label("lon")
        ).filter(
            func.date(CleanedMeasurement.created_at) == target_date,
            CleanedMeasurement.cleaned_width < 300.0
        )
        
        results = query.all()
        
        # 2. Check if enough data points exist
        if len(results) < 10:
            return []

        # 3. Prepare data for DBSCAN
        # Convert to radians for Haversine metric
        coords = np.array([(r.lat, r.lon) for r in results])
        coords_rad = np.radians(coords)

        # 4. Run DBSCAN
        # eps = distance in radians. 5 meters / Earth Radius in meters
        EARTH_RADIUS_METERS = 6371000.0
        EPSILON = 5.0 / EARTH_RADIUS_METERS
        MIN_SAMPLES = 5

        dbscan = DBSCAN(eps=EPSILON, min_samples=MIN_SAMPLES, metric='haversine', algorithm='ball_tree')
        dbscan.fit(coords_rad)

        # 5. Process clusters
        labels = dbscan.labels_
        unique_labels = set(labels)
        obstacles = []

        for label in unique_labels:
            if label == -1:
                # Noise points
                continue

            # Get points belonging to this cluster
            cluster_mask = (labels == label)
            cluster_points = coords[cluster_mask] # Use original degrees coords for centroid calculation
            
            # Calculate centroid
            centroid = np.mean(cluster_points, axis=0)
            cluster_size = len(cluster_points)

            obstacles.append({
                "lat": centroid[0],
                "lon": centroid[1],
                "severity": "critical", # All < 300cm are considered critical here
                "cluster_size": int(cluster_size)
            })

        return obstacles
