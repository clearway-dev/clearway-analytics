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

from datetime import date
from app.database import SessionLocal
from app.services.analytics_service import AnalyticsService
import traceback


def main():
    if len(sys.argv) > 1:
        today = date.fromisoformat(sys.argv[1])
    else:
        today = date.today()

    print(f"Starting statistics calculation for {today}...")

    db = SessionLocal()
    try:
        service = AnalyticsService(db)
        service.calculate_daily_stats(today)
    except Exception as e:
        print(f"An error occurred: {e}")
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
