from google.cloud import compute_v1
from google.cloud import monitoring_v3
from sqlalchemy.orm import Session
import time
import logging

from app.models import IdleResourceAlert

logger = logging.getLogger(__name__)

PROJECT_ID = "finops-dashboard-prod"
ZONE = "asia-south1-a"

# GCP Hourly pricing map for common standard machine types (approximate)
PRICING_MAP = {
    "e2-micro": 0.0101,      # ~$7.40 / month
    "e2-medium": 0.0335,     # ~$24.46 / month
    "e2-standard-2": 0.0670,  # ~$48.90 / month
    "e2-standard-4": 0.1340,  # ~$97.80 / month
    "n2-standard-2": 0.0985,  # ~$71.90 / month
    "n2-standard-4": 0.1970   # ~$143.80 / month
}

def get_live_gcp_resources(db: Session) -> list:
    """
    Directly queries the GCP Compute Engine API and GCP Cloud Monitoring API
    to return real-time active VM inventory, CPU performance, and hourly burn rates.
    """
    instance_client = compute_v1.InstancesClient()
    metric_client = monitoring_v3.MetricServiceClient()
    project_name = f"projects/{PROJECT_ID}"

    # Set up a 15-minute lookback window for live CPU metrics
    end_time_seconds = int(time.time())
    start_time_seconds = end_time_seconds - (15 * 60)
    interval = monitoring_v3.TimeInterval({
        "end_time": {"seconds": end_time_seconds},
        "start_time": {"seconds": start_time_seconds}
    })

    try:
        logger.info(f"Listing instances in zone {ZONE}...")
        instances = instance_client.list(project=PROJECT_ID, zone=ZONE)

        live_vms = []
        for instance in instances:
            instance_id = str(instance.id)
            name = instance.name
            status = instance.status  # e.g., "RUNNING", "TERMINATED"
            machine_type = instance.machine_type.split("/")[-1]
            zone_name = instance.zone.split("/")[-1]

            # 1. Calculate live cost burning rates
            hourly = PRICING_MAP.get(machine_type, 0.0335)  # Fallback to e2-medium
            daily = hourly * 24.0
            monthly = hourly * 730.0

            # 2. Get live CPU utilization from Cloud Monitoring
            cpu_util = 0.0
            if status == "RUNNING":
                try:
                    # Filter specifically for this instance
                    metric_filter = f'metric.type = "compute.googleapis.com/instance/cpu/utilization" AND resource.labels.instance_id = "{instance_id}"'
                    
                    time_series = metric_client.list_time_series(
                        request={
                            "name": project_name,
                            "filter": metric_filter,
                            "interval": interval,
                            "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL
                        }
                    )
                    
                    # Compute average over the last 15 minutes to smooth out spikes
                    points_list = []
                    for ts in time_series:
                        for p in ts.points:
                            points_list.append(p.value.double_value * 100.0)
                    
                    if points_list:
                        cpu_util = sum(points_list) / len(points_list)
                except Exception as ex:
                    logger.warning(f"Failed to query CPU metrics for instance {name}: {ex}")

            # 3. Determine live optimization recommendation
            recommendation = "Optimized (Healthy)"
            potential_savings = 0.0

            if status == "RUNNING":
                if cpu_util < 5.0:
                    recommendation = "Terminate (Idle)"
                    potential_savings = monthly
                elif cpu_util < 15.0:
                    recommendation = "Downsize (Overprovisioned)"
                    potential_savings = monthly * 0.5
            else:
                recommendation = "Optimized (Stopped)"

            # 4. Check if the user has dismissed this alert in the database
            alert = db.query(IdleResourceAlert).filter(
                IdleResourceAlert.resource_id == instance_id
            ).first()
            
            # If the alert is marked as dismissed in MySQL, we override recommendations to "Optimized (Dismissed)"
            if alert and alert.status == "Dismissed":
                recommendation = "Optimized (Dismissed)"
                potential_savings = 0.0

            # 5. Sync alert status to database for the optimization table API
            if status == "RUNNING" and (cpu_util < 15.0):
                # Update/Create active alert in DB
                db_alert = db.query(IdleResourceAlert).filter(IdleResourceAlert.resource_id == instance_id).first()
                rec_label = "VM (Terminate)" if cpu_util < 5.0 else "VM (Downsize)"
                
                if db_alert:
                    if db_alert.status != "Dismissed":
                        db_alert.average_cpu = round(cpu_util, 2)
                        db_alert.resource_type = rec_label
                        db_alert.monthly_cost = round(monthly, 2)
                        db_alert.potential_savings = round(potential_savings, 2)
                        db_alert.status = "Active"
                else:
                    new_alert = IdleResourceAlert(
                        resource_id=instance_id,
                        resource_name=name,
                        resource_type=rec_label,
                        provider="GCP",
                        region=zone_name,
                        average_cpu=round(cpu_util, 2),
                        monthly_cost=round(monthly, 2),
                        potential_savings=round(potential_savings, 2),
                        status="Active"
                    )
                    db.add(new_alert)
            else:
                # If VM is healthy or stopped, resolve any active DB alerts for it
                db_alert = db.query(IdleResourceAlert).filter(
                    IdleResourceAlert.resource_id == instance_id,
                    IdleResourceAlert.status == "Active"
                ).first()
                if db_alert:
                    db_alert.status = "Resolved"
            
            db.commit()

            live_vms.append({
                "instance_id": instance_id,
                "name": name,
                "machine_type": machine_type,
                "zone": zone_name,
                "status": status,
                "cpu_utilization": round(cpu_util, 2),
                "hourly_cost": round(hourly, 4),
                "daily_cost": round(daily, 2),
                "recommendation": recommendation,
                "potential_savings": round(potential_savings, 2)
            })

        return live_vms

    except Exception as e:
        logger.error(f"Error calling live GCP APIs: {e}")
        return []
