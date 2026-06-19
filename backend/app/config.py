# Configuration settings using Pydantic or environment variables
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "mysql+pymysql://root:password@localhost:3306/finops")
    GCP_PROJECT_ID: str = os.getenv("GCP_PROJECT_ID", "finops-dashboard-prod")

settings = Settings()
