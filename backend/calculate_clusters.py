"""
calculate_clusters.py — Pre-compute DBSCAN obstacle clusters and persist to DB.

Usage:
    python calculate_clusters.py                    # catch-up: missing dates only
    python calculate_clusters.py --date 2026-03-16  # single date (delete + recompute)
    python calculate_clusters.py --all              # recompute every date with measurements
"""

import sys
import os
import argparse

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from dotenv import load_dotenv
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))

if not os.getenv("DATABASE_URL"):
    host = os.getenv("DB_HOST", "localhost").replace("host.docker.internal", "localhost")
    os.environ["DATABASE_URL"] = (
        f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
        f"@{host}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME')}"
    )

import logging
import traceback
from datetime import date, timedelta

import numpy as np
from sklearn.cluster import DBSCAN
from sqlalchemy import text, func
from geoalchemy2 import WKTElement

from app.database import SessionLocal
from app.models import CleanedMeasurement, Cluster

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── DBSCAN parameters ────────────────────────────────────────────────────────
WIDTH_THRESHOLD_CM = 300.0        # only narrow measurements feed into clustering
EPSILON_M          = 10.0         # cluster radius in metres
MIN_SAMPLES        = 4            # minimum points to form a cluster
EPSILON            = EPSILON_M / 111_320.0  # degrees (≈ equatorial approximation)


def _severity(avg_width_m: float) -> str:
    if avg_width_m < 2.0:
        return "critical"
    if avg_width_m <= 2.5:
        return "high"
    return "medium"


def get_measurement_dates(db) -> set[date]:
    rows = db.execute(
        text("SELECT DISTINCT DATE(created_at) AS d FROM cleaned_measurements ORDER BY d")
    ).fetchall()
    return {row.d for row in rows}


def get_cluster_dates(db) -> set[date]:
    rows = db.execute(
        text("SELECT DISTINCT stat_date FROM clusters")
    ).fetchall()
    return {row.stat_date for row in rows}


def compute_for_date(target_date: date) -> None:
    db = SessionLocal()
    try:
        # Fetch narrow measurements for this date
        results = db.query(
            func.ST_Y(CleanedMeasurement.geom).label("lat"),
            func.ST_X(CleanedMeasurement.geom).label("lon"),
            CleanedMeasurement.cleaned_width,
        ).filter(
            CleanedMeasurement.created_at >= target_date,
            CleanedMeasurement.created_at < target_date + timedelta(days=1),
            CleanedMeasurement.cleaned_width < WIDTH_THRESHOLD_CM,
        ).all()

        if len(results) < MIN_SAMPLES:
            log.info("  %s: only %d narrow measurements — skipping (need ≥ %d)",
                     target_date, len(results), MIN_SAMPLES)
            # Still delete stale clusters so re-runs stay consistent
            db.query(Cluster).filter(Cluster.stat_date == target_date).delete()
            db.commit()
            return

        coords = np.array([(r.lat, r.lon) for r in results])
        widths  = np.array([r.cleaned_width for r in results])

        dbscan = DBSCAN(eps=EPSILON, min_samples=MIN_SAMPLES, metric="euclidean")
        labels = dbscan.fit_predict(coords)

        # Build cluster records (skip noise label = -1)
        new_clusters = []
        for label in set(labels):
            if label == -1:
                continue
            mask   = labels == label
            pts    = coords[mask]
            ws     = widths[mask]
            centroid = np.mean(pts, axis=0)
            avg_w_m  = float(np.mean(ws)) / 100.0
            min_w_m  = float(np.min(ws))  / 100.0
            max_w_m  = float(np.max(ws))  / 100.0

            new_clusters.append(Cluster(
                stat_date    = target_date,
                severity     = _severity(min_w_m),
                cluster_size = int(mask.sum()),
                avg_width    = round(avg_w_m, 4),
                min_width    = round(min_w_m, 4),
                max_width    = round(max_w_m, 4),
                geom         = WKTElement(
                    f"POINT({centroid[1]} {centroid[0]})", srid=4326
                ),
            ))

        # Delete stale clusters for this date, then insert fresh ones
        deleted = db.query(Cluster).filter(Cluster.stat_date == target_date).delete()
        db.bulk_save_objects(new_clusters)
        db.commit()

        log.info("  %s: %d measurements → %d clusters (replaced %d old)",
                 target_date, len(results), len(new_clusters), deleted)

    except Exception:
        db.rollback()
        log.error("Failed for %s:\n%s", target_date, traceback.format_exc())
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-compute DBSCAN clusters per date.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--date", metavar="YYYY-MM-DD", help="Recompute a single date")
    group.add_argument("--all",  action="store_true",  help="Recompute all dates with measurements")
    args = parser.parse_args()

    if args.date:
        target = date.fromisoformat(args.date)
        log.info("Single-date mode: %s", target)
        compute_for_date(target)
        return

    db = SessionLocal()
    try:
        measurement_dates = get_measurement_dates(db)
        cluster_dates     = get_cluster_dates(db) if not args.all else set()
    finally:
        db.close()

    pending = sorted(measurement_dates - cluster_dates)

    if not pending:
        log.info("All dates already have clusters. Use --all to force recompute.")
        return

    log.info("Processing %d date(s): %s", len(pending), ", ".join(str(d) for d in pending))
    for i, d in enumerate(pending, 1):
        log.info("[%d/%d] %s", i, len(pending), d)
        compute_for_date(d)

    log.info("Done. Processed %d date(s).", len(pending))


if __name__ == "__main__":
    main()
