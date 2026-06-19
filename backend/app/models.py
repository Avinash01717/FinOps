from sqlalchemy import Column, Integer, String, Date, Float, DateTime, Index
from datetime import datetime
from .database import Base

class DailyCost(Base):
    __tablename__ = "daily_costs"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), nullable=False)  # AWS or GCP
    service = Column(String(100), nullable=False)   # e.g., Compute Engine, S3
    sku = Column(String(255), nullable=True)        # SKU details
    region = Column(String(50), nullable=False)     # e.g., asia-south1
    date = Column(Date, nullable=False)
    cost = Column(Float, nullable=False)            # Cost in USD
    currency = Column(String(10), default="USD")

    # Indexes for fast querying of cost charts
    __table_args__ = (
        Index("idx_provider_date", "provider", "date"),
        Index("idx_date", "date"),
    )

class IdleResourceAlert(Base):
    __tablename__ = "idle_resource_alerts"

    id = Column(Integer, primary_key=True, index=True)
    resource_id = Column(String(255), nullable=False, unique=True) # VM instance ID
    resource_name = Column(String(255), nullable=False)            # VM instance name
    resource_type = Column(String(100), default="Virtual Machine")
    provider = Column(String(50), nullable=False)                  # GCP (all real VMs reside on GCP)
    region = Column(String(50), nullable=False)                    # e.g., asia-south1-a
    average_cpu = Column(Float, nullable=False)                    # Avg CPU over lookback window (e.g., 2.5%)
    monthly_cost = Column(Float, nullable=False)                   # VM monthly cost estimate
    potential_savings = Column(Float, nullable=False)              # Monthly potential savings (often same as cost)
    status = Column(String(50), default="Active")                  # Active, Dismissed, Resolved
    detected_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
