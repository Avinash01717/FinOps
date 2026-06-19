# FastAPI main entry point
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import costs, alerts, gcp_resources

# Disable default docs
app = FastAPI(
    title="FinOps Dashboard API",
    docs_url=None,
    redoc_url=None
)

# Configure CORS to allow frontend calls from any origin during local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API endpoints routers
app.include_router(costs.router)
app.include_router(alerts.router)
app.include_router(gcp_resources.router)

# Serve Frontend Static Files
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
frontend_dir = os.path.join(BASE_DIR, "frontend")


app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

