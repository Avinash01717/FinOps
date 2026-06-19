from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List

# Cost Schemas
class DailyCostBase(BaseModel):
    provider: str = "GCP"
    service: str
    sku: Optional[str] = None
    region: str
    date: date
    cost: float
    currency: str = "USD"

class DailyCostCreate(DailyCostBase):
    pass

class DailyCostResponse(DailyCostBase):
    id: int

    class Config:
        from_attributes = True

# Idle Resource Alert Schemas
class IdleResourceAlertBase(BaseModel):
    resource_id: str
    resource_name: str
    resource_type: str = "VM (Terminate)"  # VM (Terminate) or VM (Downsize)
    provider: str = "GCP"
    region: str
    average_cpu: float
    monthly_cost: float
    potential_savings: float
    status: str = "Active"

class IdleResourceAlertUpdate(BaseModel):
    status: str

class IdleResourceAlertResponse(IdleResourceAlertBase):
    id: int
    detected_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Dashboard Summary Schema - GCP Dedicated
class DashboardSummaryResponse(BaseModel):
    total_wasted_monthly: float
    active_alerts_count: int
    gcp_total_cost_90d: float
    gcp_total_cost_30d: float
