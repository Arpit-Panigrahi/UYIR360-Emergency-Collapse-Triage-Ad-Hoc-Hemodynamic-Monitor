import fs from "fs";
import path from "path";
import { config } from "../config.ts";

export interface PatientRecord {
  patient_id: string;
  session_token: string;
  created_at: string;
  gps_lat?: number;
  gps_lon?: number;
  status: string;
}

export interface TriagePhotoRecord {
  photo_id: string;
  patient_id: string;
  storage_path: string;
  captured_at: string;
  capture_modality: string;
  triage_color: string;
  esi_level: number;
  ai_confidence: number;
  detected_tags: string[];
  notes?: string;
}

export interface VitalEntryRecord {
  id: number;
  recorded_at: string;
  patient_id: string;
  heart_rate_bpm: number;
  respiration_rate_brpm: number;
  spo2_percent: number;
  perfusion_index: number;
  hrv_rmssd_ms: number;
  hrv_sdnn_ms: number;
  hrv_lf_hf_ratio: number;
  mews_score: number;
  anomaly_detected: boolean;
  anomaly_reason?: string | null;
}

export interface ClinicalEventRecord {
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

class InMemoryDb {
  private dbPath: string;
  public patients: PatientRecord[] = [];
  public triagePhotos: TriagePhotoRecord[] = [];
  public vitals: VitalEntryRecord[] = [];
  public events: ClinicalEventRecord[] = [];

  constructor() {
    this.dbPath = path.join(config.storageDir, "db_state.json");
    this.load();
  }

  private load() {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, "utf-8");
        const data = JSON.parse(raw);
        this.patients = data.patients || [];
        this.triagePhotos = data.triagePhotos || [];
        this.vitals = data.vitals || [];
        this.events = data.events || [];
      } catch (e) {
        // Fallback
      }
    }
  }

  public persist() {
    try {
      fs.writeFileSync(
        this.dbPath,
        JSON.stringify(
          {
            patients: this.patients,
            triagePhotos: this.triagePhotos,
            vitals: this.vitals.slice(-500), // Keep last 500 vitals
            events: this.events,
          },
          null,
          2
        )
      );
    } catch (e) {}
  }
}

export const db = new InMemoryDb();
