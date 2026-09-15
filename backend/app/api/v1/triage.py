import uuid
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.db import get_db
from backend.app.models.schema import Patient, TriagePhoto, ClinicalEvent
from backend.app.services.storage import storage_service
from backend.app.services.triage_cv import PreliminaryVisionTriageEngine
from alert_engine.telegram_bot import forward_triage_photo_alert

router = APIRouter(prefix="/triage", tags=["Preliminary Photo Triage"])

@router.post("/intake-photo")
async def submit_preliminary_photo(
    photo: UploadFile = File(...),
    patient_id: str = Form(None),
    gps_lat: float = Form(None),
    gps_lon: float = Form(None),
    notes: str = Form(None),
    capture_modality: str = Form("wound"),
    db: AsyncSession = Depends(get_db)
):
    """
    Flow 1: Preliminary photo sent by patient or field responder.
    Executes automated triage CV analysis, registers the incident,
    and immediately forwards the event with photo attachment to Paramedic Telegram.
    """
    if not patient_id:
        patient_id = str(uuid.uuid4())

    content = await photo.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty photo upload")

    # 1. Save Photo
    filename = f"{patient_id}_{uuid.uuid4().hex[:8]}.jpg"
    storage_path = storage_service.save_photo_file(filename, content)

    # 2. Vision Triage Analysis
    analysis = PreliminaryVisionTriageEngine.analyze_photo(content, capture_modality=capture_modality)

    # 3. Persist Patient & Triage Record in DB
    result = await db.execute(select(Patient).where(Patient.patient_id == patient_id))
    patient = result.scalars().first()
    if not patient:
        patient = Patient(
            patient_id=patient_id,
            session_token=uuid.uuid4().hex,
            gps_lat=gps_lat,
            gps_lon=gps_lon,
            status="active"
        )
        db.add(patient)

    triage_record = TriagePhoto(
        patient_id=patient_id,
        storage_path=storage_path,
        capture_modality=capture_modality,
        triage_color=analysis["triage_color"],
        esi_level=analysis["esi_level"],
        ai_confidence=analysis["confidence"],
        detected_tags=analysis["detected_tags"],
        notes=notes
    )
    db.add(triage_record)

    # 4. Log Clinical Event
    event = ClinicalEvent(
        patient_id=patient_id,
        event_type="PHOTO_TRIAGE",
        severity="CRITICAL" if analysis["triage_color"] == "RED" else "WARNING",
        event_payload={
            "triage_color": analysis["triage_color"],
            "esi_level": analysis["esi_level"],
            "tags": analysis["detected_tags"],
            "gps": {"lat": gps_lat, "lon": gps_lon}
        },
        card_image_path=storage_path
    )
    db.add(event)
    await db.commit()

    # 5. Flow 3: Immediately Forward to Paramedic Telegram
    tg_result = await forward_triage_photo_alert(
        patient_id=patient_id,
        triage_color=analysis["triage_color"],
        esi_level=analysis["esi_level"],
        confidence=analysis["confidence"],
        detected_tags=analysis["detected_tags"],
        photo_path=storage_path,
        gps_lat=gps_lat,
        gps_lon=gps_lon,
        notes=notes
    )

    return {
        "status": "success",
        "patient_id": patient_id,
        "photo_id": triage_record.photo_id,
        "triage_color": analysis["triage_color"],
        "esi_level": analysis["esi_level"],
        "ai_confidence": analysis["confidence"],
        "detected_tags": analysis["detected_tags"],
        "metrics": analysis.get("metrics", {}),
        "photo_url": f"/storage/photos/{filename}",
        "telegram_dispatch": tg_result
    }

@router.get("/cases")
async def get_recent_triage_cases(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """
    Returns list of recent triage cases for central monitoring dashboard.
    """
    result = await db.execute(
        select(TriagePhoto).order_by(TriagePhoto.captured_at.desc()).limit(limit)
    )
    cases = result.scalars().all()
    return [
        {
            "photo_id": c.photo_id,
            "patient_id": c.patient_id,
            "captured_at": c.captured_at.isoformat(),
            "triage_color": c.triage_color,
            "esi_level": c.esi_level,
            "detected_tags": c.detected_tags,
            "photo_path": c.storage_path
        }
        for c in cases
    ]
