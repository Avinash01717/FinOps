import os
import sys
from datetime import datetime, date, timedelta
import random

# Add backend directory to sys.path to resolve imports correctly
# __file__ is backend/app/scripts/generate_synthetic_costs.py
# parent is backend/app/scripts
# grandparent is backend/app
# great-grandparent is backend
backend_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(backend_path)

from app.database import engine, Base, SessionLocal
from app.models import DailyCost, IdleResourceAlert

def generate_data():
    db = SessionLocal()
    try:
        print("Creating database tables if they do not exist...")
        Base.metadata.create_all(bind=engine)
        
        # Clear existing data to allow clean re-runs
        print("Clearing existing cost data and alerts...")
        db.query(DailyCost).delete()
        db.query(IdleResourceAlert).delete()
        db.commit()

        print("Generating 90 days of cost data...")
        
        # Define services and their average daily spend characteristics
        gcp_services = [
            {"name": "Compute Engine", "sku": "E2 Instance Core", "region": "asia-south1", "min_cost": 30.0, "max_cost": 45.0},
            {"name": "Cloud Storage", "sku": "Standard Storage", "region": "asia-south1", "min_cost": 2.0, "max_cost": 4.5},
            {"name": "BigQuery", "sku": "Analysis Queries", "region": "asia-south1", "min_cost": 1.0, "max_cost": 8.0},
            {"name": "Cloud Run", "sku": "CPU Allocation", "region": "asia-south1", "min_cost": 0.5, "max_cost": 2.0}
        ]

        aws_services = [
            {"name": "EC2", "sku": "t3.medium Instance", "region": "ap-south-1", "min_cost": 40.0, "max_cost": 65.0},
            {"name": "S3", "sku": "Standard Storage", "region": "ap-south-1", "min_cost": 4.0, "max_cost": 8.0},
            {"name": "RDS", "sku": "db.m5.large Multi-AZ", "region": "ap-south-1", "min_cost": 18.0, "max_cost": 28.0},
            {"name": "Lambda", "sku": "Request Compute", "region": "ap-south-1", "min_cost": 0.1, "max_cost": 1.2}
        ]

        today = date.today()
        start_date = today - timedelta(days=90)
        
        daily_costs_to_insert = []
        current_date = start_date

        while current_date <= today:
            # Generate GCP costs
            for service in gcp_services:
                # Add random fluctuation
                cost = round(random.uniform(service["min_cost"], service["max_cost"]), 2)
                # Introduce a cost spike on some days for BigQuery (e.g. heavy query days)
                if service["name"] == "BigQuery" and random.random() < 0.15:
                    cost += round(random.uniform(15.0, 35.0), 2)
                
                daily_costs_to_insert.append(
                    DailyCost(
                        provider="GCP",
                        service=service["name"],
                        sku=service["sku"],
                        region=service["region"],
                        date=current_date,
                        cost=cost,
                        currency="USD"
                    )
                )

            # Generate AWS costs
            for service in aws_services:
                cost = round(random.uniform(service["min_cost"], service["max_cost"]), 2)
                # Introduce weekly spike on weekends for backups (S3/RDS)
                if service["name"] in ["S3", "RDS"] and current_date.weekday() in [5, 6]:
                    cost *= 1.25
                    cost = round(cost, 2)
                
                daily_costs_to_insert.append(
                    DailyCost(
                        provider="AWS",
                        service=service["name"],
                        sku=service["sku"],
                        region=service["region"],
                        date=current_date,
                        cost=cost,
                        currency="USD"
                    )
                )

            current_date += timedelta(days=1)

        # Batch insert costs
        db.bulk_save_objects(daily_costs_to_insert)
        print(f"Successfully inserted {len(daily_costs_to_insert)} daily cost records.")

        # Generate sample Idle Resource alerts
        print("Generating mock idle resource alerts...")
        alerts = [
            IdleResourceAlert(
                resource_id="gce-prod-web-vm-1",
                resource_name="prod-web-vm-1",
                resource_type="Virtual Machine",
                provider="GCP",
                region="asia-south1-a",
                average_cpu=1.8,  # Under 5% threshold
                monthly_cost=48.50,
                potential_savings=48.50,
                status="Active"
            ),
            IdleResourceAlert(
                resource_id="gce-dev-test-db",
                resource_name="dev-test-db",
                resource_type="Virtual Machine",
                provider="GCP",
                region="asia-south1-b",
                average_cpu=0.4,  # Under 5% threshold
                monthly_cost=142.10,
                potential_savings=142.10,
                status="Active"
            ),
            IdleResourceAlert(
                resource_id="gce-staging-api-server",
                resource_name="staging-api-server",
                resource_type="Virtual Machine",
                provider="GCP",
                region="asia-south1-a",
                average_cpu=4.1,  # Under 5% threshold
                monthly_cost=24.20,
                potential_savings=24.20,
                status="Active"
            )
        ]

        db.bulk_save_objects(alerts)
        db.commit()
        print(f"Successfully inserted {len(alerts)} active idle resource alerts.")
        print("Data generation complete!")

    except Exception as e:
        db.rollback()
        print(f"Error occurred during data generation: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    generate_data()
