# FastAPI main entry point
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import costs, alerts

app = FastAPI(title="FinOps Dashboard API")

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

@app.get("/")
def read_root():
    return {
        "message": "FinOps Dashboard API is running",
        "docs": "/docs"
    }

