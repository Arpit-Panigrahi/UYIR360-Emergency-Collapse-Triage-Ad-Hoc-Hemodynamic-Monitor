import json
import uuid
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.core.db import AsyncSessionLocal
from backend.app.core.config import settings
from backend.app.models.schema import VitalsContinuous, ClinicalEvent
from dsp_engine.processor import ClinicalPPGProcessor
from dsp_engine.card_generator import generate_clinical_multibiomarker_card
from alert_engine.telegram_bot import forward_vital_breach_alert

router = APIRouter(prefix="/telemetry", tags=["Cardiovascular & Respiratory Telemetry"])

processor = ClinicalPPGProcessor(fs=30.0)

# In-memory sliding buffer per patient for real-time DSP analysis
patient_buffers: dict[str, list] = {}

def calculate_mews(hr: float, rr: float) -> int:
    """Calculates simplified Modified Early Warning Score (MEWS) from vitals."""
    score = 0
    if hr < 40 or hr >= 130:
        score += 3
    elif hr < 50 or hr >= 111:
        score += 2
    elif hr >= 101:
        score += 1

    if rr < 9 or rr >= 30:
        score += 3
    elif rr >= 21:
        score += 2
    elif rr < 12:
        score += 1
    return score

async def process_and_evaluate_vitals(patient_id: str, samples: list, is_rgb: bool = True) -> dict:
    """
    Executes DSP extraction on accumulated samples, checks clinical breach thresholds,
    and forwards critical events with diagnostic charts to Telegram.
    """
    raw_array = np.array(samples, dtype=np.float32)
    analysis = processor.analyze_window(raw_array, is_rgb=is_rgb)

    hr = analysis["dominant_bpm"]
    rr = analysis["respiration_brpm"]
    spo2 = analysis["spo2_percent"]
    rmssd = analysis["rmssd_ms"]
    mews = calculate_mews(hr, rr)
    analysis["mews_score"] = mews

    # Anomaly Detection Logic
    anomaly_detected = False
    anomaly_reasons = []

    if hr > settings.HR_MAX:
        anomaly_detected = True
        anomaly_reasons.append(f"Severe Tachycardia ({hr} BPM)")
    elif hr < settings.HR_MIN:
        anomaly_detected = True
        anomaly_reasons.append(f"Severe Bradycardia ({hr} BPM)")

    if rr > settings.RR_MAX or rr < settings.RR_MIN:
        anomaly_detected = True
        anomaly_reasons.append(f"Respiratory Distress ({rr} BrPM)")

    if spo2 < settings.SPO2_MIN:
        anomaly_detected = True
        anomaly_reasons.append(f"Critical Hypoxemia ({spo2}%)")

    if rmssd < settings.HRV_RMSSD_MIN and hr > 100:
        anomaly_detected = True
        anomaly_reasons.append(f"Autonomic Collapse / Low HRV ({rmssd} ms)")

    if mews >= 5:
        anomaly_detected = True
        anomaly_reasons.append(f"High Clinical MEWS Risk ({mews}/14)")

    reason_str = "; ".join(anomaly_reasons) if anomaly_detected else None

    # Persist in DB
    async with AsyncSessionLocal() as session:
        vital_entry = VitalsContinuous(
            patient_id=patient_id,
            heart_rate_bpm=hr,
            respiration_rate_brpm=rr,
            spo2_proxy_percent=spo2,
            perfusion_index=analysis["perfusion_index"],
            hrv_rmssd_ms=rmssd,
            hrv_sdnn_ms=analysis["sdnn_ms"],
            hrv_lf_hf_ratio=analysis["lf_hf_ratio"],
            poincare_sd1=analysis["poincare_sd1"],
            poincare_sd2=analysis["poincare_sd2"],
            pulse_crest_time_ms=analysis["pulse_crest_time_ms"],
            mews_score=mews,
            anomaly_detected=anomaly_detected,
            anomaly_reason=reason_str
        )
        session.add(vital_entry)

        # Flow 3: If Anomaly, Generate 6-Panel Chart and Push to Paramedic Telegram
        chart_path = None
        if anomaly_detected:
            chart_filename = f"chart_{patient_id}_{uuid.uuid4().hex[:6]}.png"
            chart_path = str(settings.STORAGE_LOCAL_DIR / "charts" / chart_filename)
            generate_clinical_multibiomarker_card(patient_id, analysis, chart_path, fs=processor.fs)

            event = ClinicalEvent(
                patient_id=patient_id,
                event_type="CRITICAL_VITAL_BREACH",
                severity="CRITICAL",
                event_payload={
                    "vitals": {
                        "hr": hr, "rr": rr, "spo2": spo2, "rmssd": rmssd, "mews": mews
                    },
                    "reason": reason_str
                },
                card_image_path=chart_path
            )
            session.add(event)
            await session.commit()

            # Forward to Telegram
            await forward_vital_breach_alert(
                patient_id=patient_id,
                vitals=analysis,
                chart_path=chart_path,
                anomaly_reason=reason_str
            )
        else:
            await session.commit()

    analysis["anomaly_detected"] = anomaly_detected
    analysis["anomaly_reason"] = reason_str
    analysis["chart_path"] = chart_path
    return analysis

@router.websocket("/stream/{patient_id}")
async def telemetry_websocket_stream(websocket: WebSocket, patient_id: str):
    """
    Flow 2: Continuous real-time ingestion of cardiovascular & respiratory stats.
    Client transmits 30 FPS sensor batches; server extracts multi-biomarkers,
    monitors anomalies, and immediately forwards alerts to Telegram.
    """
    await websocket.accept()
    if patient_id not in patient_buffers:
        patient_buffers[patient_id] = []

    try:
        while True:
            data_text = await websocket.receive_text()
            payload = json.loads(data_text)
            samples = payload.get("samples", [])
            is_rgb = payload.get("sensor_type") == "rppg_rgb"

            for s in samples:
                if is_rgb:
                    patient_buffers[patient_id].append([s.get("r", 0), s.get("g", 0), s.get("b", 0)])
                else:
                    patient_buffers[patient_id].append(s.get("val", 0))

            # Maintain sliding window of 30 seconds (900 samples at 30Hz)
            max_window = int(processor.fs * 30)
            if len(patient_buffers[patient_id]) > max_window:
                patient_buffers[patient_id] = patient_buffers[patient_id][-max_window:]

            # Run DSP extraction when we have at least 5 seconds of data (150 samples)
            if len(patient_buffers[patient_id]) >= int(processor.fs * 5):
                analysis = await process_and_evaluate_vitals(
                    patient_id,
                    patient_buffers[patient_id],
                    is_rgb=is_rgb
                )

                # Send feedback to client
                filtered = analysis.get("filtered_bvp", [])
                recent_wave = filtered[-30:] if len(filtered) >= 30 else filtered
                await websocket.send_text(json.dumps({
                    "status": "active",
                    "heart_rate_bpm": analysis["dominant_bpm"],
                    "respiration_rate_brpm": analysis["respiration_brpm"],
                    "spo2_percent": analysis["spo2_percent"],
                    "hrv_rmssd_ms": analysis["rmssd_ms"],
                    "mews_score": analysis["mews_score"],
                    "anomaly_detected": analysis["anomaly_detected"],
                    "anomaly_reason": analysis["anomaly_reason"],
                    "wave_slice": recent_wave
                }))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.close()

@router.post("/ingest-batch")
async def ingest_periodic_batch(payload: dict):
    """
    REST alternative to WebSocket for periodic micro-batch uploads (e.g. every 3-5 seconds).
    """
    patient_id = payload.get("patient_id", str(uuid.uuid4()))
    samples = payload.get("samples", [])
    is_rgb = payload.get("sensor_type") == "rppg_rgb"

    if len(samples) < 15:
        raise HTTPException(status_code=400, detail="Insufficient sample batch size")

    analysis = await process_and_evaluate_vitals(patient_id, samples, is_rgb=is_rgb)
    return {
        "status": "processed",
        "patient_id": patient_id,
        "vitals": {
            "heart_rate_bpm": analysis["dominant_bpm"],
            "respiration_rate_brpm": analysis["respiration_brpm"],
            "spo2_percent": analysis["spo2_percent"],
            "hrv_rmssd_ms": analysis["rmssd_ms"],
            "mews_score": analysis["mews_score"]
        },
        "anomaly_detected": analysis["anomaly_detected"],
        "anomaly_reason": analysis["anomaly_reason"]
    }
