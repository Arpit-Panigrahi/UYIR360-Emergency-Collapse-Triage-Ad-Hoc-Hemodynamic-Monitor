export interface TriageResponse {
  status: string;
  patient_id: string;
  photo_id: string;
  triage_color: "RED" | "YELLOW" | "GREEN" | "BLACK";
  esi_level: number;
  ai_confidence: number;
  detected_tags: string[];
  metrics: {
    hemorrhage_ratio?: number;
    cyanosis_ratio?: number;
    mean_saturation?: number;
  };
  photo_url: string;
  telegram_dispatch: {
    status: string;
    telegram_message_id?: string | number;
  };
}

export interface TelemetryVitalsResponse {
  status: string;
  patient_id: string;
  vitals: {
    heart_rate_bpm: number;
    respiration_rate_brpm: number;
    spo2_percent: number;
    perfusion_index?: number;
    hrv_rmssd_ms: number;
    hrv_sdnn_ms?: number;
    hrv_lf_hf_ratio?: number;
    mews_score: number;
  };
  sppg_diagnostics?: {
    contact_pressure_status: "UNDER_PRESSURE" | "OPTIMAL" | "OVER_PRESSURE_BLANCHING";
    asystole_detected: boolean;
    sqi_metrics: {
      pi_sqi_pass: boolean;
      template_correlation: number;
      skewness: number;
      zero_crossing_integrity: boolean;
      overall_sqi_score: number;
    };
    sdppg_metrics: {
      aging_index: number;
      stiffness_ratio_b_a: number;
      mean_crest_time_ms: number;
    };
    tri_modal_respiration: {
      bw_brpm: number;
      am_brpm: number;
      fm_brpm: number;
      consensus_brpm: number;
      time_domain_agreement: boolean;
    };
    crest_time_ms: number;
  };
  anomaly_detected: boolean;
  anomaly_reason?: string | null;
}

export interface ClinicalEventItem {
  event_id: string;
  patient_id: string;
  triggered_at: string;
  event_type: string;
  severity: string;
  payload: any;
  chart_image_path?: string | null;
  status: string;
  acknowledged: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function submitTriagePhoto(formData: FormData): Promise<TriageResponse> {
  const resp = await fetch(`${API_BASE}/api/v1/triage/intake-photo`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) {
    throw new Error(`Failed submitting photo: ${resp.statusText}`);
  }
  return resp.json();
}

export async function ingestTelemetryBatch(payload: {
  patient_id: string;
  sensor_type: string;
  samples: number[][];
}): Promise<TelemetryVitalsResponse> {
  const resp = await fetch(`${API_BASE}/api/v1/telemetry/ingest-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`Failed ingesting batch: ${resp.statusText}`);
  }
  return resp.json();
}

export async function generateFullPatientReport(payload: {
  patient_id: string;
  sensor_type: string;
  samples: number[][];
}): Promise<{
  status: string;
  patient_id: string;
  chart_url: string;
  telegram_status: string;
  telegram_message_id?: number | string;
  vitals: {
    heart_rate_bpm: number;
    respiration_rate_brpm: number;
    spo2_percent: number;
    perfusion_index: number;
    hrv_rmssd_ms: number;
    hrv_sdnn_ms: number;
    hrv_lf_hf_ratio: number;
    mews_score: number;
  };
  sppg_diagnostics: any;
}> {
  const resp = await fetch(`${API_BASE}/api/v1/telemetry/generate-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`Failed generating report: ${resp.statusText}`);
  }
  return resp.json();
}

export async function getParamedicEvents(): Promise<ClinicalEventItem[]> {
  const resp = await fetch(`${API_BASE}/api/v1/paramedic/events`);
  if (!resp.ok) {
    throw new Error(`Failed loading events: ${resp.statusText}`);
  }
  return resp.json();
}

export async function acknowledgeEvent(eventId: string): Promise<any> {
  const resp = await fetch(`${API_BASE}/api/v1/paramedic/events/${eventId}/acknowledge`, {
    method: "POST",
  });
  return resp.json();
}
