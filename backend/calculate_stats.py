import sys
import os

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
from datetime import date
from sqlalchemy import text
from app.database import SessionLocal
from app.services.analytics_service import AnalyticsService
import traceback

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


def get_measurement_dates(db) -> set[date]:
    """Return all distinct dates that have at least one cleaned measurement."""
    rows = db.execute(
        text("SELECT DISTINCT DATE(created_at) AS d FROM cleaned_measurements ORDER BY d")
    ).fetchall()
    return {row.d for row in rows}


def get_stats_dates(db) -> set[date]:
    """Return all distinct dates that already have computed segment statistics."""
    rows = db.execute(
        text("SELECT DISTINCT stat_date FROM segment_statistics")
    ).fetchall()
    return {row.stat_date for row in rows}


def run_single_date(target_date: date) -> None:
    """Open a DB session, compute stats for *target_date*, then close the session."""
    db = SessionLocal()
    try:
        service = AnalyticsService(db)
        service.calculate_daily_stats(target_date)
    except Exception:
        log.error("Failed to calculate stats for %s:\n%s", target_date, traceback.format_exc())
    finally:
        db.close()


def main() -> None:
    # -- Manual override: single date passed as CLI argument ----------------
    if len(sys.argv) > 1:
        target = date.fromisoformat(sys.argv[1])
        log.info("Manual mode: calculating stats for %s", target)
        run_single_date(target)
        return

    # -- Catch-up mode: find and fill all missing dates ---------------------
    # Today is always recomputed (data may still be arriving during an active session).
    # Historical dates that already have statistics are skipped.
    log.info("Catch-up mode: scanning for dates with missing statistics...")

    today = date.today()

    db = SessionLocal()
    try:
        measurement_dates = get_measurement_dates(db)
        stats_dates = get_stats_dates(db)
    finally:
        db.close()

    missing = sorted((measurement_dates - stats_dates) | ({today} & measurement_dates))

    if not missing:
        log.info("All measurement dates already have statistics. Nothing to do.")
        return

    log.info(
        "Found %d date(s) to process: %s",
        len(missing),
        ", ".join(str(d) for d in missing),
    )

    for i, target_date in enumerate(missing, start=1):
        log.info("[%d/%d] Processing %s...", i, len(missing), target_date)
        run_single_date(target_date)

    log.info("Catch-up complete. Processed %d date(s).", len(missing))


if __name__ == "__main__":
    main()
