from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from typing import List, Optional

from app.database import get_db
from app.models import DailyCost, IdleResourceAlert
from app.schemas import DashboardSummaryResponse

router = APIRouter(prefix="/api/costs", tags=["Costs"])

@router.get("/summary", response_model=DashboardSummaryResponse)
def get_costs_summary(db: Session = Depends(get_db)):
    """
    Returns dashboard high-level KPIs: total cloud spend over 90 days,
    active alerts count, and total monthly potential savings (wasted spend).
    """
    today = date.today()
    ninety_days_ago = today - timedelta(days=90)

    # 1. Calculate AWS Total spend (90 days)
    aws_total = db.query(func.sum(DailyCost.cost)).filter(
        DailyCost.provider == "AWS",
        DailyCost.date >= ninety_days_ago
    ).scalar() or 0.0

    # 2. Calculate GCP Total spend (90 days)
    gcp_total = db.query(func.sum(DailyCost.cost)).filter(
        DailyCost.provider == "GCP",
        DailyCost.date >= ninety_days_ago
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
        "aws_total_cost_90d": round(aws_total, 2),
        "gcp_total_cost_90d": round(gcp_total, 2)
    }

@router.get("/trends")
def get_cost_trends(
    days: int = Query(30, description="Lookback window in days"),
    db: Session = Depends(get_db)
):
    """
    Returns daily aggregated costs grouped by date and provider
    for a given lookback window, formatted for frontend line charts.
    """
    start_date = date.today() - timedelta(days=days)

    results = db.query(
        DailyCost.date,
        DailyCost.provider,
        func.sum(DailyCost.cost).label("daily_cost")
    ).filter(
        DailyCost.date >= start_date
    ).group_by(
        DailyCost.date,
        DailyCost.provider
    ).order_by(
        DailyCost.date.asc()
    ).all()

    # Format the payload for Chart.js
    # Structure: {"date1": {"AWS": 45.0, "GCP": 32.0}, "date2": {...}}
    trends_map = {}
    for date_val, provider, cost in results:
        date_str = date_val.strftime("%Y-%m-%d")
        if date_str not in trends_map:
            trends_map[date_str] = {"AWS": 0.0, "GCP": 0.0}
        trends_map[date_str][provider] = round(cost, 2)

    # Convert to list format for easier chart parsing
    # [{"date": "2026-06-01", "AWS": 45.0, "GCP": 32.0}, ...]
    trends_list = []
    for date_str, costs in trends_map.items():
        trends_list.append({
            "date": date_str,
            "AWS": costs["AWS"],
            "GCP": costs["GCP"]
        })

    return trends_list

@router.get("/breakdown")
def get_service_breakdown(
    provider: Optional[str] = Query(None, description="Filter by AWS or GCP"),
    days: int = Query(30, description="Lookback window in days"),
    db: Session = Depends(get_db)
):
    """
    Returns total spend per service over the lookback window,
    formatted for pie charts and tables.
    """
    start_date = date.today() - timedelta(days=days)

    query = db.query(
        DailyCost.service,
        func.sum(DailyCost.cost).label("service_cost")
    ).filter(
        DailyCost.date >= start_date
    )

    if provider:
        query = query.filter(DailyCost.provider == provider)

    results = query.group_by(DailyCost.service).order_by(func.sum(DailyCost.cost).desc()).all()

    breakdown = []
    for service, cost in results:
        breakdown.append({
            "service": service,
            "cost": round(cost, 2)
        })

    return breakdown
