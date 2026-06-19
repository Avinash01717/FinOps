from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import IdleResourceAlert
from app.schemas import IdleResourceAlertResponse, IdleResourceAlertUpdate

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])

@router.get("", response_model=List[IdleResourceAlertResponse])
def get_alerts(
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Returns a list of GCE VM idle resource alerts, optionally filtered by status
    (Active, Dismissed, Resolved).
    """
    query = db.query(IdleResourceAlert)
    
    if status:
        query = query.filter(IdleResourceAlert.status == status)
        
    # Order by active alerts first, then newest detections
    alerts = query.order_by(
        IdleResourceAlert.status.asc(), # 'Active' comes before 'Dismissed'/'Resolved' alphabetically
        IdleResourceAlert.detected_at.desc()
    ).all()
    
    return alerts

@router.put("/{alert_id}/status", response_model=IdleResourceAlertResponse)
def update_alert_status(
    alert_id: int,
    payload: IdleResourceAlertUpdate,
    db: Session = Depends(get_db)
):
    """
    Updates the status of a specific idle resource alert (e.g., to Dismissed or Resolved).
    """
    alert = db.query(IdleResourceAlert).filter(IdleResourceAlert.id == alert_id).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Idle alert with id {alert_id} not found."
        )
        
    valid_statuses = ["Active", "Dismissed", "Resolved"]
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )
        
    alert.status = payload.status
    db.commit()
    db.refresh(alert)
    
    return alert
