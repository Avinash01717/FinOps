# FastAPI main entry point
from fastapi import FastAPI

app = FastAPI(title="FinOps Dashboard API")

@app.get("/")
def read_root():
    return {"message": "FinOps Dashboard API is running"}
