import os
import sys
import argparse
from datetime import datetime, date, timedelta
import logging

# Set up logging format
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("fetch_daily_costs")

# Add backend directory to sys.path to resolve imports correctly
# __file__ is backend/app/scripts/fetch_daily_costs.py
backend_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(backend_path)

from app.database import SessionLocal
from app.models import DailyCost
from app.services.aws_billing import get_aws_daily_costs
from app.services.gcp_billing import get_gcp_daily_costs
from app.services.idle_detector import run_idle_detection

def fetch_and_store_costs(start_date: date, end_date: date):
    """
    Orchestrates daily ingestion of costs from GCP BigQuery and AWS (mock API),
    upserting records to MySQL database.
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting ingestion process from {start_date} to {end_date}...")
        
        # 1. Fetch GCP Costs
        logger.info("Fetching GCP costs...")
        gcp_records = get_gcp_daily_costs(start_date, end_date)
        logger.info(f"Received {len(gcp_records)} records from GCP.")

        # 2. Fetch AWS Costs
        logger.info("Fetching AWS costs...")
        aws_raw = get_aws_daily_costs(start_date, end_date)
        
        # Parse AWS Raw Cost Explorer response structure into database records list
        aws_records = []
        for result in aws_raw.get("ResultsByTime", []):
            time_start = datetime.strptime(result["TimePeriod"]["Start"], "%Y-%m-%d").date()
            for group in result.get("Groups", []):
                # Keys are [Service, Region, SKU]
                keys = group.get("Keys", ["Unknown", "ap-south-1", "Unknown SKU"])
                service_name = keys[0]
                region = keys[1] if len(keys) > 1 else "ap-south-1"
                sku = keys[2] if len(keys) > 2 else "Standard"
                
                cost_amount = float(group["Metrics"]["UnblendedCost"]["Amount"])
                
                aws_records.append({
                    "date": time_start,
                    "service": service_name,
                    "sku": sku,
                    "region": region,
                    "cost": cost_amount
                })
        logger.info(f"Received and parsed {len(aws_records)} records from AWS.")

        # 3. Upsert into MySQL
        all_records = []
        for rec in gcp_records:
            all_records.append(("GCP", rec))
        for rec in aws_records:
            all_records.append(("AWS", rec))

        upsert_count = 0
        for provider, rec in all_records:
            # Look for existing record to avoid duplicate keys and allow updates
            existing = db.query(DailyCost).filter(
                DailyCost.provider == provider,
                DailyCost.service == rec["service"],
                DailyCost.sku == rec["sku"],
                DailyCost.region == rec["region"],
                DailyCost.date == rec["date"]
            ).first()

            if existing:
                existing.cost = rec["cost"]
            else:
                new_cost = DailyCost(
                    provider=provider,
                    service=rec["service"],
                    sku=rec["sku"],
                    region=rec["region"],
                    date=rec["date"],
                    cost=rec["cost"],
                    currency="USD"
                )
                db.add(new_cost)
            upsert_count += 1

        db.commit()
        logger.info(f"Upserted {upsert_count} cost rows into daily_costs table.")

        # 4. Trigger VM Idle Resource Detector
        logger.info("Triggering GCP Cloud Monitoring idle resource analysis...")
        idle_count = run_idle_detection(db)
        logger.info(f"Idle resource detection complete. Scanned and flagged {idle_count} idle instances.")
        
        logger.info("Daily ingestion job completed successfully!")

    except Exception as e:
        db.rollback()
        logger.error(f"Daily ingestion failed: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch daily cloud billing and monitoring data.")
    parser.add_argument("--days", type=int, default=1, help="Number of lookback days (default: 1)")
    args = parser.parse_args()

    # Default range is yesterday
    yesterday = date.today() - timedelta(days=args.days)
    today = date.today()

    fetch_and_store_costs(yesterday, today)
