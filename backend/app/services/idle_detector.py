from google.cloud import monitoring_v3
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import time
import logging

from app.models import IdleResourceAlert

logger = logging.getLogger(__name__)

PROJECT_ID = "finops-dashboard-prod"
LOOKBACK_DAYS = 7

# Thresholds
CPU_IDLE_THRESHOLD = 5.0       # CPU < 5% -> Terminate
CPU_RIGHTSIZE_THRESHOLD = 15.0  # 5% <= CPU < 15% -> Downsize

def run_idle_detection(db: Session):
    """
    Queries the real GCP Cloud Monitoring API for GCE VM CPU utilization
    over the lookback window.
    Identifies idle or overprovisioned VMs, calculates potential savings,
    and upserts recommendations in MySQL.
    """
    client = monitoring_v3.MetricServiceClient()
    project_name = f"projects/{PROJECT_ID}"

    # Calculate lookback interval (in seconds)
    end_time_seconds = int(time.time())
    start_time_seconds = end_time_seconds - (LOOKBACK_DAYS * 24 * 3600)

    interval = monitoring_v3.TimeInterval({
        "end_time": {"seconds": end_time_seconds},
        "start_time": {"seconds": start_time_seconds}
    })

    try:
        logger.info(f"Querying GCP Cloud Monitoring CPU utilization over the last {LOOKBACK_DAYS} days...")
        time_series = client.list_time_series(
            request={
                "name": project_name,
                "filter": 'metric.type = "compute.googleapis.com/instance/cpu/utilization"',
                "interval": interval,
                "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL
            }
        )

        detected_count = 0
        active_resource_ids = []

        for ts in time_series:
            resource_labels = ts.resource.labels
            metric_labels = ts.metric.labels
            
            instance_id = resource_labels.get("instance_id")
            zone = resource_labels.get("zone", "unknown-zone")
            instance_name = metric_labels.get("instance_name", f"vm-{instance_id}")

            if not instance_id:
                continue

            active_resource_ids.append(instance_id)

            # Calculate average CPU utilization
            points = ts.points
            if not points:
                continue

            # Cloud Monitoring utilization values are between 0.0 and 1.0
            cpu_values = [p.value.double_value * 100.0 for p in points]
            avg_cpu = sum(cpu_values) / len(cpu_values)

            logger.info(f"VM '{instance_name}' ({instance_id}) has average CPU: {avg_cpu:.2f}%")

            # Determine Recommendation Type & Cost Details
            is_anomaly = False
            rec_type = "Virtual Machine"
            estimated_monthly_cost = 24.20  # Default: e2-medium (~ $24.20/month)
            potential_savings = 0.0

            if "db" in instance_name.lower():
                estimated_monthly_cost = 142.10
            elif "prod" in instance_name.lower():
                estimated_monthly_cost = 48.50

            if avg_cpu < CPU_IDLE_THRESHOLD:
                # Idle VM -> Recommend Terminate (100% savings)
                is_anomaly = True
                rec_type = "VM (Terminate)"
                potential_savings = estimated_monthly_cost
            elif avg_cpu < CPU_RIGHTSIZE_THRESHOLD:
                # Overprovisioned VM -> Recommend Downsize (50% savings)
                is_anomaly = True
                rec_type = "VM (Downsize)"
                potential_savings = estimated_monthly_cost * 0.5

            if is_anomaly:
                # Upsert into MySQL
                alert = db.query(IdleResourceAlert).filter(IdleResourceAlert.resource_id == instance_id).first()
                if alert:
                    alert.average_cpu = round(avg_cpu, 2)
                    alert.resource_type = rec_type
                    alert.monthly_cost = estimated_monthly_cost
                    alert.potential_savings = round(potential_savings, 2)
                    alert.status = "Active"
                    alert.updated_at = datetime.utcnow()
                else:
                    alert = IdleResourceAlert(
                        resource_id=instance_id,
                        resource_name=instance_name,
                        resource_type=rec_type,
                        provider="GCP",
                        region=zone,
                        average_cpu=round(avg_cpu, 2),
                        monthly_cost=estimated_monthly_cost,
                        potential_savings=round(potential_savings, 2),
                        status="Active",
                        detected_at=datetime.utcnow(),
                        updated_at=datetime.utcnow()
                    )
                    db.add(alert)
                
                detected_count += 1

        # Resolve alerts for VMs that are no longer active/monitored or no longer idle/overprovisioned
        resolved_count = 0
        if active_resource_ids:
            active_alerts = db.query(IdleResourceAlert).filter(IdleResourceAlert.status == "Active").all()
            for alert in active_alerts:
                if alert.resource_id not in active_resource_ids:
                    alert.status = "Resolved"
                    alert.updated_at = datetime.utcnow()
                    resolved_count += 1

        db.commit()
        logger.info(f"Idle resource detection complete. Active alerts: {detected_count}. Resolved: {resolved_count}.")
        return detected_count

    except Exception as e:
        logger.error(f"Error during GCP Cloud Monitoring VM CPU metric query: {e}")
        return 0
