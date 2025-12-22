from datetime import date
from app.database import SessionLocal
from app.services.analytics_service import AnalyticsService
import traceback


def main():
    # today = date.today()
    today = date(2025, 12, 21)

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
