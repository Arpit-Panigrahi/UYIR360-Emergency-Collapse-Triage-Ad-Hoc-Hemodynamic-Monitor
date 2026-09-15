import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, DateTime, Boolean, Text, JSON
from sqlalchemy.orm import declarative_base

Base = declarative_base()

def get_utc_now():
    return datetime.now(timezone.utc)

class Patient(Base):
    __tablename__ = "patients"

    patient_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_token = Column(String(64), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=get_utc_now)
    name = Column(String(100), default="Anonymous Patient")
    age = Column(Integer, nullable=True)
    gender = Column(String(20), nullable=True)
    contact_phone = Column(String(32), nullable=True)
    gps_lat = Column(Float, nullable=True)
    gps_lon = Column(Float, nullable=True)
    status = Column(String(32), default="active") # active, transporting, admitted, resolved

class TriagePhoto(Base):
    __tablename__ = "triage_photos"

    photo_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), index=True, nullable=False)
    storage_path = Column(String(255), nullable=False)
    captured_at = Column(DateTime, default=get_utc_now)
    capture_modality = Column(String(32), default="wound") # wound, face, pupil, jaundice
    triage_color = Column(String(16), default="YELLOW") # RED, YELLOW, GREEN, BLACK
    esi_level = Column(Integer, default=3) # 1 to 5
    ai_confidence = Column(Float, default=0.85)
    detected_tags = Column(JSON, default=list) # e.g. ["bleeding", "abrasion", "cyanosis"]
    pupil_metrics = Column(JSON, default=dict)
    notes = Column(Text, nullable=True)

class VitalsContinuous(Base):
    __tablename__ = "vitals_continuous"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recorded_at = Column(DateTime, default=get_utc_now, index=True)
    patient_id = Column(String(36), index=True, nullable=False)
    heart_rate_bpm = Column(Float, nullable=False)
    respiration_rate_brpm = Column(Float, nullable=True)
    spo2_proxy_percent = Column(Float, nullable=True)
    perfusion_index = Column(Float, nullable=True)
    hrv_rmssd_ms = Column(Float, nullable=True)
    hrv_sdnn_ms = Column(Float, nullable=True)
    hrv_lf_hf_ratio = Column(Float, nullable=True)
    poincare_sd1 = Column(Float, nullable=True)
    poincare_sd2 = Column(Float, nullable=True)
    pulse_crest_time_ms = Column(Float, nullable=True)
    mews_score = Column(Integer, default=0)
    anomaly_detected = Column(Boolean, default=False)
    anomaly_reason = Column(String(128), nullable=True)

class ClinicalEvent(Base):
    __tablename__ = "clinical_events"

    event_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), index=True, nullable=False)
    triggered_at = Column(DateTime, default=get_utc_now)
    event_type = Column(String(64), nullable=False) # 'PHOTO_TRIAGE', 'CRITICAL_VITAL_BREACH'
    severity = Column(String(16), nullable=False) # 'CRITICAL', 'WARNING', 'INFO'
    event_payload = Column(JSON, nullable=False)
    card_image_path = Column(String(255), nullable=True)
    telegram_message_id = Column(String(64), nullable=True)
    acknowledged = Column(Boolean, default=False)
    status = Column(String(32), default="DISPATCHED") # DISPATCHED, ACKNOWLEDGED, RESOLVED
