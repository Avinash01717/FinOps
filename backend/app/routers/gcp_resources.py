from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from typing import List, Optional

from app.services.live_gcp import (
    start_gcp_instance,
    stop_gcp_instance,
    delete_gcp_instance,
    create_gcp_instance,
    list_gcp_vpcs,
    create_gcp_vpc,
    delete_gcp_vpc,
    list_gcp_service_accounts,
    create_gcp_service_account,
    delete_gcp_service_account,
    list_gcp_buckets,
    delete_gcp_bucket
)

router = APIRouter(prefix="/api/gcp", tags=["GCP Management"])

# Pydantic Schemas
class VMCreateSchema(BaseModel):
    name: str = Field(..., example="my-free-vm")
    zone: str = Field(default="asia-south1-a", example="asia-south1-a")
    machine_type: str = Field(default="e2-micro", example="e2-micro")

class VPCCreateSchema(BaseModel):
    name: str = Field(..., example="my-custom-vpc")
    auto_create_subnetworks: bool = Field(default=True)

class IAMCreateSchema(BaseModel):
    account_id: str = Field(..., example="temp-user-sa")
    display_name: str = Field(..., example="Temporary User SA")

# VM Endpoints
@router.post("/vms/start")
def start_vm(name: str, zone: str = "asia-south1-a"):
    try:
        start_gcp_instance(name, zone)
        return {"message": f"Instance {name} started successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/vms/stop")
def stop_vm(name: str, zone: str = "asia-south1-a"):
    try:
        stop_gcp_instance(name, zone)
        return {"message": f"Instance {name} stopped successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/vms/create")
def create_vm(payload: VMCreateSchema):
    try:
        create_gcp_instance(payload.name, payload.zone, payload.machine_type)
        return {"message": f"Instance {payload.name} created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/vms")
def delete_vm(name: str, zone: str = "asia-south1-a", confirm: str = Query(default=None)):
    if confirm != "true":
        raise HTTPException(
            status_code=400,
            detail="Missing confirmation. Add ?confirm=true to permanently delete this VM."
        )
    try:
        delete_gcp_instance(name, zone)
        return {"message": f"Instance {name} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# VPC Endpoints
@router.get("/vpcs")
def get_vpcs():
    try:
        return list_gcp_vpcs()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/vpcs/create")
def create_vpc(payload: VPCCreateSchema):
    try:
        create_gcp_vpc(payload.name, payload.auto_create_subnetworks)
        return {"message": f"VPC Network {payload.name} created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/vpcs/{name}")
def delete_vpc(name: str, confirm: str = Query(default=None)):
    if confirm != "true":
        raise HTTPException(
            status_code=400,
            detail="Missing confirmation. Add ?confirm=true to permanently delete this VPC network."
        )
    try:
        delete_gcp_vpc(name)
        return {"message": f"VPC Network {name} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# IAM Endpoints
@router.get("/iam")
def get_iam():
    try:
        return list_gcp_service_accounts()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/iam/create")
def create_iam(payload: IAMCreateSchema):
    try:
        sa = create_gcp_service_account(payload.account_id, payload.display_name)
        return {"message": f"Service Account {payload.account_id} created successfully", "data": sa}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/iam/{email}")
def delete_iam(email: str, confirm: str = Query(default=None)):
    if confirm != "true":
        raise HTTPException(
            status_code=400,
            detail="Missing confirmation. Add ?confirm=true to permanently delete this service account."
        )
    try:
        delete_gcp_service_account(email)
        return {"message": f"Service Account {email} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Storage Bucket Endpoints
@router.get("/buckets")
def get_buckets():
    try:
        return list_gcp_buckets()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/buckets/{name}")
def delete_bucket(name: str, confirm: str = Query(default=None)):
    if confirm != "true":
        raise HTTPException(
            status_code=400,
            detail="Missing confirmation. Add ?confirm=true to permanently delete this bucket."
        )
    try:
        delete_gcp_bucket(name)
        return {"message": f"Storage Bucket {name} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
