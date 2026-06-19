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
from app.services.gcp_billing import get_gcp_daily_costs
from app.services.idle_detector import run_idle_detection

def fetch_and_store_costs(start_date: date, end_date: date):
    """
    Orchestrates daily ingestion of costs from GCP BigQuery (with fallback),
    upserting records to MySQL database.
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting GCP ingestion process from {start_date} to {end_date}...")
        
        # 1. Fetch GCP Costs
        logger.info("Fetching GCP costs...")
        gcp_records = get_gcp_daily_costs(start_date, end_date)
        logger.info(f"Received {len(gcp_records)} records from GCP.")

        # 2. Upsert into MySQL
        upsert_count = 0
        for rec in gcp_records:
            # Look for existing record to avoid duplicate keys and allow updates
            existing = db.query(DailyCost).filter(
                DailyCost.provider == "GCP",
                DailyCost.service == rec["service"],
                DailyCost.sku == rec["sku"],
                DailyCost.region == rec["region"],
                DailyCost.date == rec["date"]
            ).first()

            if existing:
                existing.cost = rec["cost"]
            else:
                new_cost = DailyCost(
                    provider="GCP",
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

        # 3. Trigger VM Idle Resource Detector
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
    parser = argparse.ArgumentParser(description="Fetch daily GCP billing and monitoring data.")
    parser.add_argument("--days", type=int, default=1, help="Number of lookback days (default: 1)")
    args = parser.parse_args()

    # Default range is yesterday
    yesterday = date.today() - timedelta(days=args.days)
    today = date.today()

    fetch_and_store_costs(yesterday, today)
