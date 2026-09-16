from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.db import get_db
from backend.app.models.schema import ClinicalEvent, VitalsContinuous, Patient

router = APIRouter(prefix="/paramedic", tags=["Paramedic Dispatch & Incidents"])

@router.get("/events")
async def get_active_events(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """
    Returns live feed of all clinical events, photo triage submissions,
    and vital threshold breaches for paramedic stations.
    """
    result = await db.execute(
        select(ClinicalEvent).order_by(ClinicalEvent.triggered_at.desc()).limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "event_id": e.event_id,
            "patient_id": e.patient_id,
            "triggered_at": e.triggered_at.isoformat(),
            "event_type": e.event_type,
            "severity": e.severity,
            "payload": e.event_payload,
            "chart_image_path": e.card_image_path,
            "status": e.status,
            "acknowledged": e.acknowledged
        }
        for e in events
    ]

@router.post("/events/{event_id}/acknowledge")
async def acknowledge_event(event_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ClinicalEvent).where(ClinicalEvent.event_id == event_id))
    event = result.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.acknowledged = True
    event.status = "ACKNOWLEDGED"
    await db.commit()
    return {"status": "success", "event_id": event_id, "state": "ACKNOWLEDGED"}

@router.get("/patient/{patient_id}/vitals")
async def get_patient_vitals_history(patient_id: str, limit: int = 60, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VitalsContinuous)
        .where(VitalsContinuous.patient_id == patient_id)
        .order_by(VitalsContinuous.recorded_at.desc())
        .limit(limit)
    )
    vitals = result.scalars().all()
    return [
        {
            "recorded_at": v.recorded_at.isoformat(),
            "heart_rate_bpm": v.heart_rate_bpm,
            "respiration_rate_brpm": v.respiration_rate_brpm,
            "spo2_percent": v.spo2_proxy_percent,
            "hrv_rmssd_ms": v.hrv_rmssd_ms,
            "mews_score": v.mews_score,
            "anomaly": v.anomaly_detected,
            "reason": v.anomaly_reason
        }
        for v in reversed(vitals)
    ]
