from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from typing import List

from app.database import get_db
from app.models import DailyCost, IdleResourceAlert
from app.schemas import DashboardSummaryResponse

router = APIRouter(prefix="/api/costs", tags=["Costs"])

@router.get("/summary", response_model=DashboardSummaryResponse)
def get_costs_summary(db: Session = Depends(get_db)):
    """
    Returns dashboard high-level GCP KPIs: total spend over 90 days,
    total spend over 30 days, active alerts count, and total monthly wasted cost.
    """
    today = date.today()
    thirty_days_ago = today - timedelta(days=30)
    ninety_days_ago = today - timedelta(days=90)

    # 1. Calculate GCP Total spend (90 days)
    gcp_90d = db.query(func.sum(DailyCost.cost)).filter(
        DailyCost.provider == "GCP",
        DailyCost.date >= ninety_days_ago
    ).scalar() or 0.0

    # 2. Calculate GCP Total spend (30 days)
    gcp_30d = db.query(func.sum(DailyCost.cost)).filter(
        DailyCost.provider == "GCP",
        DailyCost.date >= thirty_days_ago
    ).scalar() or 0.0

    # 3. Get Active Idle alerts details
    active_alerts = db.query(IdleResourceAlert).filter(
        IdleResourceAlert.status == "Active"
    ).all()
    
    alerts_count = len(active_alerts)
    wasted_total = sum(alert.potential_savings for alert in active_alerts)

    return {
        "total_wasted_monthly": round(wasted_total, 2),
        "active_alerts_count": alerts_count,
        "gcp_total_cost_90d": round(gcp_90d, 2),
        "gcp_total_cost_30d": round(gcp_30d, 2)
    }

@router.get("/trends")
def get_cost_trends(
    days: int = Query(30, description="Lookback window in days"),
    db: Session = Depends(get_db)
):
    """
    Returns daily GCP costs over the lookback window, formatted for line charts.
    """
    start_date = date.today() - timedelta(days=days)

    results = db.query(
        DailyCost.date,
        func.sum(DailyCost.cost).label("daily_cost")
    ).filter(
        DailyCost.provider == "GCP",
        DailyCost.date >= start_date
    ).group_by(
        DailyCost.date
    ).order_by(
        DailyCost.date.asc()
    ).all()

    trends_list = []
    for date_val, cost in results:
        trends_list.append({
            "date": date_val.strftime("%Y-%m-%d"),
            "cost": round(cost, 2)
        })

    return trends_list

@router.get("/breakdown")
def get_service_breakdown(
    days: int = Query(30, description="Lookback window in days"),
    db: Session = Depends(get_db)
):
    """
    Returns total GCP spend per service over the lookback window,
    formatted for doughnut charts.
    """
    start_date = date.today() - timedelta(days=days)

    results = db.query(
        DailyCost.service,
        func.sum(DailyCost.cost).label("service_cost")
    ).filter(
        DailyCost.provider == "GCP",
        DailyCost.date >= start_date
    ).group_by(
        DailyCost.service
    ).order_by(
        func.sum(DailyCost.cost).desc()
    ).all()

    breakdown = []
    for service, cost in results:
        breakdown.append({
            "service": service,
            "cost": round(cost, 2)
        })

    return breakdown
