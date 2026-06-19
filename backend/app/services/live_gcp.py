from google.cloud import compute_v1
from google.cloud import monitoring_v3
from google.cloud import storage
from sqlalchemy.orm import Session
import time
import logging
import os
import requests
import google.auth
from google.auth.transport.requests import Request

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
        logger.info("Listing instances across all zones...")
        request = compute_v1.AggregatedListInstancesRequest(project=PROJECT_ID)
        instances_cursor = instance_client.aggregated_list(request=request)

        live_vms = []
        for zone_path, instances_in_zone in instances_cursor:
            if not instances_in_zone.instances:
                continue
            for instance in instances_in_zone.instances:
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


# =====================================================================
# GCE VM Lifecycle Management Write Operations
# =====================================================================

def start_gcp_instance(instance_name: str, zone: str = ZONE):
    """Starts a stopped GCE VM instance."""
    client = compute_v1.InstancesClient()
    operation = client.start(project=PROJECT_ID, zone=zone, instance=instance_name)
    return operation.result()

def stop_gcp_instance(instance_name: str, zone: str = ZONE):
    """Stops a running GCE VM instance."""
    client = compute_v1.InstancesClient()
    operation = client.stop(project=PROJECT_ID, zone=zone, instance=instance_name)
    return operation.result()

def delete_gcp_instance(instance_name: str, zone: str = ZONE):
    """Deletes a GCE VM instance."""
    client = compute_v1.InstancesClient()
    operation = client.delete(project=PROJECT_ID, zone=zone, instance=instance_name)
    return operation.result()

def create_gcp_instance(instance_name: str, zone: str = ZONE, machine_type: str = "e2-micro"):
    """Creates a new GCE VM instance (defaults to e2-micro in ZONE)."""
    client = compute_v1.InstancesClient()
    
    machine_type_uri = f"projects/{PROJECT_ID}/zones/{zone}/machineTypes/{machine_type}"
    source_image = "projects/debian-cloud/global/images/family/debian-12"
    
    disk = compute_v1.AttachedDisk(
        boot=True,
        auto_delete=True,
        initialize_params=compute_v1.AttachedDiskInitializeParams(
            source_image=source_image,
            disk_size_gb=10,
            disk_type=f"projects/{PROJECT_ID}/zones/{zone}/diskTypes/pd-standard"
        )
    )
    
    # Dynamically find an available VPC network to deploy the VM into
    networks = list_gcp_vpcs()
    network_name = "default"
    if networks:
        network_name = networks[0]["name"]
        
    network_interface = compute_v1.NetworkInterface(
        network=f"projects/{PROJECT_ID}/global/networks/{network_name}",
        access_configs=[
            compute_v1.AccessConfig(
                name="External NAT",
                type_="ONE_TO_ONE_NAT",
                network_tier="PREMIUM"
            )
        ]
    )
    
    instance = compute_v1.Instance(
        name=instance_name,
        machine_type=machine_type_uri,
        disks=[disk],
        network_interfaces=[network_interface]
    )
    
    operation = client.insert(project=PROJECT_ID, zone=zone, instance_resource=instance)
    return operation.result()


# =====================================================================
# VPC Network Write Operations
# =====================================================================

def list_gcp_vpcs() -> list:
    """Lists all VPC networks in the project."""
    try:
        client = compute_v1.NetworksClient()
        networks = client.list(project=PROJECT_ID)
        vpc_list = []
        for network in networks:
            vpc_list.append({
                "name": network.name,
                "id": str(network.id),
                "routing_config": network.routing_config.routing_mode if network.routing_config else "REGIONAL",
                "auto_create_subnetworks": network.auto_create_subnetworks,
                "subnetworks": [s.split("/")[-1] for s in network.subnetworks] if network.subnetworks else []
            })
        return vpc_list
    except Exception as e:
        logger.error(f"Error listing VPCs: {e}")
        return []

def create_gcp_vpc(network_name: str, auto_create_subnetworks: bool = True):
    """Creates a new custom VPC network."""
    client = compute_v1.NetworksClient()
    network = compute_v1.Network(
        name=network_name,
        auto_create_subnetworks=auto_create_subnetworks
    )
    operation = client.insert(project=PROJECT_ID, network_resource=network)
    return operation.result()

def delete_gcp_vpc(network_name: str):
    """Deletes a VPC network."""
    client = compute_v1.NetworksClient()
    operation = client.delete(project=PROJECT_ID, network=network_name)
    return operation.result()


# =====================================================================
# IAM Service Accounts Write Operations (via direct REST calls)
# =====================================================================

def get_iam_headers():
    """Generates OAuth2 request headers using standard credentials."""
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
    credentials, project = google.auth.default(scopes=scopes)
    credentials.refresh(Request())
    return {
        "Authorization": f"Bearer {credentials.token}",
        "Content-Type": "application/json"
    }

def list_gcp_service_accounts() -> list:
    """Lists project Service Accounts."""
    try:
        headers = get_iam_headers()
        url = f"https://iam.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts"
        res = requests.get(url, headers=headers)
        if res.status_code == 200:
            data = res.json()
            accounts = data.get("accounts", [])
            results = []
            for acc in accounts:
                results.append({
                    "name": acc.get("displayName", "Unnamed"),
                    "email": acc.get("email"),
                    "unique_id": acc.get("uniqueId"),
                    "project_id": acc.get("projectId"),
                    "disabled": acc.get("disabled", False)
                })
            return results
        else:
            logger.error(f"Failed to list service accounts from IAM API: {res.text}")
            return []
    except Exception as e:
        logger.error(f"Error listing service accounts: {e}")
        return []

def create_gcp_service_account(account_id: str, display_name: str) -> dict:
    """Creates a new IAM Service Account."""
    headers = get_iam_headers()
    url = f"https://iam.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts"
    body = {
        "accountId": account_id,
        "serviceAccount": {
            "displayName": display_name
        }
    }
    res = requests.post(url, headers=headers, json=body)
    if res.status_code == 200:
        return res.json()
    else:
        raise Exception(f"Failed to create service account: {res.text}")

def delete_gcp_service_account(email: str):
    """Deletes an IAM Service Account."""
    headers = get_iam_headers()
    url = f"https://iam.googleapis.com/v1/projects/{PROJECT_ID}/serviceAccounts/{email}"
    res = requests.delete(url, headers=headers)
    if res.status_code == 200:
        return True
    else:
        raise Exception(f"Failed to delete service account: {res.text}")


# =====================================================================
# Cloud Storage Buckets Write Operations
# =====================================================================

def list_gcp_buckets() -> list:
    """Lists all Cloud Storage buckets in the project."""
    try:
        client = storage.Client(project=PROJECT_ID)
        buckets = client.list_buckets()
        bucket_list = []
        for bucket in buckets:
            bucket_list.append({
                "name": bucket.name,
                "location": bucket.location,
                "storage_class": bucket.storage_class,
                "created_at": bucket.time_created.isoformat() if bucket.time_created else "N/A"
            })
        return bucket_list
    except Exception as e:
        logger.error(f"Error listing Cloud Storage buckets: {e}")
        return []

def delete_gcp_bucket(bucket_name: str):
    """Deletes a Cloud Storage bucket by name."""
    client = storage.Client(project=PROJECT_ID)
    bucket = client.bucket(bucket_name)
    bucket.delete()
    return True
