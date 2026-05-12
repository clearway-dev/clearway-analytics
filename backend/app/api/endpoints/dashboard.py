from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.database import get_db
from app.services.dashboard_service import DashboardService
from app.api.deps import get_current_active_user
from app.core.constants import PASSABILITY_THRESHOLD_CM

router = APIRouter()


@router.get("/stats", dependencies=[Depends(get_current_active_user)])
async def get_dashboard_stats(
    target_date: Optional[date] = None,
    vehicle_width_cm: float = PASSABILITY_THRESHOLD_CM,
    db: Session = Depends(get_db),
):
    """
    Returns global KPI statistics for the admin dashboard.
    """
    return DashboardService(db).get_global_stats(target_date, vehicle_width_cm)


@router.get("/coverage", dependencies=[Depends(get_current_active_user)])
async def get_coverage_map(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Returns GeoJSON heatmap of measurement coverage.
    If target_date is provided, shows coverage for that date only.
    """
    return DashboardService(db).get_coverage_map_data(target_date)


@router.get("/available-dates", dependencies=[Depends(get_current_active_user)])
async def get_available_dates(db: Session = Depends(get_db)):
    """
    Returns a list of dates for which data is available.
    """
    return {"dates": DashboardService(db).get_available_dates()}
