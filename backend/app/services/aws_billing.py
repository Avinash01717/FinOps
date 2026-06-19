from datetime import date, timedelta
import random

def get_aws_daily_costs(start_date: date, end_date: date) -> dict:
    """
    Simulates the AWS Cost Explorer API (ce.get_cost_and_usage) response.
    Sourced from synthetic data to avoid the real AWS Cost Explorer API cost ($0.01 per call).
    This is a cost-control engineering design decision documented in docs/notes.md.
    
    The returned dictionary matches the exact shape of the real AWS SDK response,
    making the backend and database layers 100% cloud-agnostic.
    """
    aws_services = [
        {"name": "EC2", "sku": "t3.medium Instance", "region": "ap-south-1", "min_cost": 40.0, "max_cost": 65.0},
        {"name": "S3", "sku": "Standard Storage", "region": "ap-south-1", "min_cost": 4.0, "max_cost": 8.0},
        {"name": "RDS", "sku": "db.m5.large Multi-AZ", "region": "ap-south-1", "min_cost": 18.0, "max_cost": 28.0},
        {"name": "Lambda", "sku": "Request Compute", "region": "ap-south-1", "min_cost": 0.1, "max_cost": 1.2}
    ]

    results_by_time = []
    current_date = start_date

    while current_date <= end_date:
        next_date = current_date + timedelta(days=1)
        groups = []

        for service in aws_services:
            # Generate realistic synthetic cost
            cost = round(random.uniform(service["min_cost"], service["max_cost"]), 2)
            
            # Weekend spikes on S3/RDS for backups
            if service["name"] in ["S3", "RDS"] and current_date.weekday() in [5, 6]:
                cost = round(cost * 1.25, 2)
            
            groups.append({
                "Keys": [service["name"], service["region"], service["sku"]],
                "Metrics": {
                    "UnblendedCost": {
                        "Amount": str(cost),
                        "Unit": "USD"
                    }
                }
            })

        results_by_time.append({
            "TimePeriod": {
                "Start": current_date.strftime("%Y-%m-%d"),
                "End": next_date.strftime("%Y-%m-%d")
            },
            "Total": {},
            "Groups": groups,
            "Estimated": False
        })

        current_date = next_date

    return {
        "ResultsByTime": results_by_time,
        "DimensionValueAttributes": []
    }
