from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List

# Live Instance Info Schema
class LiveInstanceResponse(BaseModel):
    instance_id: str
    name: str
    machine_type: str
    zone: str
    status: str
    cpu_utilization: float
    hourly_cost: float
    daily_cost: float
    recommendation: str  # Terminate (Idle), Downsize (Overprovisioned), or Optimized (Healthy)
    potential_savings: float

# Idle Resource Alert Schemas
class IdleResourceAlertUpdate(BaseModel):
    status: str

class IdleResourceAlertResponse(BaseModel):
    id: int
    resource_id: str
    resource_name: str
    resource_type: str
    provider: str
    region: str
    average_cpu: float
    monthly_cost: float
    potential_savings: float
    status: str
    detected_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Dashboard Summary Schema - Live Metrics
class DashboardSummaryResponse(BaseModel):
    total_wasted_monthly: float
    active_alerts_count: int
    gcp_hourly_burn_rate: float
    gcp_daily_burn_rate: float
