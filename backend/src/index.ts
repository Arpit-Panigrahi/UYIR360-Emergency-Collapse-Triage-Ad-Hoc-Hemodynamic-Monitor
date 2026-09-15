import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.ts";
import { ClinicalPPGProcessor } from "./dsp/processor.ts";
import type { PPGAnalysisResult } from "./dsp/processor.ts";
import { generateClinicalSvgCard } from "./dsp/cardGenerator.ts";
import { storageService } from "./services/storage.ts";
import { telegramService } from "./services/telegram.ts";
import { db } from "./services/db.ts";

const processor = new ClinicalPPGProcessor(30.0);
const patientBuffers: Map<string, number[][] | number[]> = new Map();

function setCorsHeaders(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function evaluateVitalsAndEscalate(patientId: string, samples: number[][] | number[], isRgb: boolean = true) {
  const analysis = processor.analyzeWindow(samples, isRgb);

  // Simplified MEWS risk score
  let mews = 0;
  if (analysis.dominant_bpm < 40 || analysis.dominant_bpm >= 130) mews += 3;
  else if (analysis.dominant_bpm < 50 || analysis.dominant_bpm >= 111) mews += 2;
  else if (analysis.dominant_bpm >= 101) mews += 1;

  if (analysis.respiration_brpm < 9 || analysis.respiration_brpm >= 30) mews += 3;
  else if (analysis.respiration_brpm >= 21) mews += 2;
  else if (analysis.respiration_brpm < 12) mews += 1;

  // Anomaly criteria
  let anomalyDetected = false;
  const reasons: string[] = [];

  if (analysis.asystole_detected) {
    anomalyDetected = true;
    reasons.push("PULSELESSNESS / ASYSTOLE DETECTED - INITIATE CPR NOW");
    mews = Math.max(mews, 6);
  }

  if (analysis.contact_pressure_status === "OVER_PRESSURE_BLANCHING") {
    reasons.push("Sternal Over-Pressure (Capillary Blanching)");
  }

  if (analysis.dominant_bpm > config.hrMax) {
    anomalyDetected = true;
    reasons.push(`Severe Tachycardia (${analysis.dominant_bpm} BPM)`);
  } else if (analysis.dominant_bpm < config.hrMin && !analysis.asystole_detected) {
    anomalyDetected = true;
    reasons.push(`Severe Bradycardia (${analysis.dominant_bpm} BPM)`);
  }

  if (analysis.respiration_brpm > config.rrMax || analysis.respiration_brpm < config.rrMin) {
    anomalyDetected = true;
    reasons.push(`Respiratory Distress (${analysis.respiration_brpm} BrPM)`);
  }

  if (analysis.spo2_percent < config.spo2Min) {
    anomalyDetected = true;
    reasons.push(`Critical Hypoxemia (${analysis.spo2_percent}%)`);
  }

  if (analysis.rmssd_ms < config.hrvRmssdMin && analysis.dominant_bpm > 100) {
    anomalyDetected = true;
    reasons.push(`Autonomic Depression / Low HRV (${analysis.rmssd_ms} ms)`);
  }

  if (mews >= 5) {
    anomalyDetected = true;
    reasons.push(`High Clinical MEWS Risk (${mews}/14)`);
  }

  const reasonStr = reasons.join("; ");

  // Save vital entry
  db.vitals.push({
    id: db.vitals.length + 1,
    recorded_at: new Date().toISOString(),
    patient_id: patientId,
    heart_rate_bpm: analysis.dominant_bpm,
    respiration_rate_brpm: analysis.respiration_brpm,
    spo2_percent: analysis.spo2_percent,
    perfusion_index: analysis.perfusion_index,
    hrv_rmssd_ms: analysis.rmssd_ms,
    hrv_sdnn_ms: analysis.sdnn_ms,
    hrv_lf_hf_ratio: analysis.lf_hf_ratio,
    mews_score: mews,
    anomaly_detected: anomalyDetected,
    anomaly_reason: reasonStr || null,
  });

  let chartPath: string | null = null;

  if (anomalyDetected) {
    const chartFilename = `chart_${patientId}_${Date.now()}.svg`;
    chartPath = path.join(config.chartsDir, chartFilename);
    generateClinicalSvgCard(patientId, analysis, chartPath, processor.fs);

    // Save clinical event
    db.events.push({
      event_id: crypto.randomUUID(),
      patient_id: patientId,
      triggered_at: new Date().toISOString(),
      event_type: "CRITICAL_VITAL_BREACH",
      severity: "CRITICAL",
      payload: {
        vitals: {
          hr: analysis.dominant_bpm,
          rr: analysis.respiration_brpm,
          spo2: analysis.spo2_percent,
          rmssd: analysis.rmssd_ms,
          mews: mews,
        },
        reason: reasonStr,
      },
      chart_image_path: chartPath,
      status: "DISPATCHED",
      acknowledged: false,
    });

    console.log(`[ALERT] Patient ${patientId} triggered vital breach: ${reasonStr}`);
    const tgRes = await telegramService.forwardVitalBreachAlert({
      patientId,
      vitals: analysis,
      chartPath,
      anomalyReason: reasonStr,
      mewsScore: mews,
    });
    console.log(`[TELEGRAM] Vital alert dispatched: status=${tgRes.status}, msg_id=${tgRes.telegram_message_id}, error=${tgRes.error || "none"}`);
  }

  db.persist();

  return {
    analysis,
    mews,
    anomalyDetected,
    reasonStr,
    chartPath,
  };
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  console.log(`[HTTP ${req.method}] ${pathname}`);

  // Static files in storage
  if (pathname.startsWith("/storage/")) {
    const filePath = path.join(config.storageDir, pathname.replace("/storage/", ""));
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".json": "application/json",
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "File not found" }));
    return;
  }

  // Health
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", environment: config.environment, runtime: "Node.js TypeScript" }));
    return;
  }

  // FLOW: POST /api/v1/telemetry/ingest-batch
  if (pathname === "/api/v1/telemetry/ingest-batch" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const patientId = payload.patient_id || `PT-${Math.floor(10000 + Math.random() * 90000)}`;
      const samples = payload.samples || [];
      const isRgb =
        payload.sensor_type === "rppg_rgb" ||
        (Array.isArray(samples[0]) && samples[0].length >= 3);

      if (samples.length < 10) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Insufficient samples" }));
        return;
      }

      const { analysis, mews, anomalyDetected, reasonStr } = await evaluateVitalsAndEscalate(
        patientId,
        samples,
        isRgb
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "processed",
          patient_id: patientId,
          vitals: {
            heart_rate_bpm: analysis.dominant_bpm,
            respiration_rate_brpm: analysis.respiration_brpm,
            spo2_percent: analysis.spo2_percent,
            perfusion_index: analysis.perfusion_index,
            hrv_rmssd_ms: analysis.rmssd_ms,
            hrv_sdnn_ms: analysis.sdnn_ms,
            hrv_lf_hf_ratio: analysis.lf_hf_ratio,
            mews_score: mews,
          },
          sppg_diagnostics: {
            contact_pressure_status: analysis.contact_pressure_status,
            contact_pressure: {
              status: analysis.contact_pressure_status,
              feedback:
                analysis.contact_pressure_status === "OVER_PRESSURE_BLANCHING"
                  ? "Excessive sternal contact force (capillary blanching)"
                  : analysis.contact_pressure_status === "UNDER_PRESSURE"
                  ? "Insufficient contact coupling (air-gap detected)"
                  : "Optimal hemodynamic transmural pressure",
              perfusion_index_percent: analysis.perfusion_index,
            },
            asystole_detected: analysis.asystole_detected,
            sqi_metrics: analysis.sqi_metrics,
            sqi: {
              overall_sqi_pct: Math.round(analysis.sqi_metrics.overall_sqi_score * 100),
              tier:
                analysis.sqi_metrics.overall_sqi_score > 0.8
                  ? "TIER_1_EXCELLENT"
                  : analysis.sqi_metrics.overall_sqi_score > 0.5
                  ? "TIER_2_ACCEPTABLE"
                  : "TIER_3_REJECTED",
              pi_pass: analysis.sqi_metrics.pi_sqi_pass,
              skewness: analysis.sqi_metrics.skewness,
            },
            sdppg_metrics: {
              aging_index: analysis.sdppg_metrics.aging_index,
              stiffness_ratio_b_a: analysis.sdppg_metrics.stiffness_ratio_b_a,
              mean_crest_time_ms: analysis.sdppg_metrics.mean_crest_time_ms,
            },
            sdppg: {
              aging_index: analysis.sdppg_metrics.aging_index,
              b_to_a_ratio: analysis.sdppg_metrics.stiffness_ratio_b_a,
              mean_crest_time_ms: analysis.sdppg_metrics.mean_crest_time_ms,
            },
            tri_modal_respiration: analysis.tri_modal_respiration,
            crest_time_ms: analysis.pulse_crest_time_ms,
          },
          anomaly_detected: anomalyDetected,
          anomaly_reason: reasonStr,
        })
      );
      return;
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // FLOW: POST /api/v1/telemetry/generate-report
  if (pathname === "/api/v1/telemetry/generate-report" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const patientId = payload.patient_id || `PT-${Math.floor(10000 + Math.random() * 90000)}`;
      const samples = payload.samples || [];
      const isRgb =
        payload.sensor_type === "rppg_rgb" ||
        payload.sensor_type === "sppg_contact" ||
        (Array.isArray(samples[0]) && samples[0].length >= 3);

      if (samples.length < 15) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Insufficient samples (at least 15 required for clinical report)" }));
        return;
      }

      const analysis = processor.analyzeWindow(samples, isRgb);

      // Generate the scientific 4-panel SVG
      const chartFilename = `clinical_report_${patientId}_${Date.now()}.svg`;
      const chartPath = path.join(config.chartsDir, chartFilename);
      generateClinicalSvgCard(patientId, analysis, chartPath, processor.fs);

      // Simplified MEWS risk score
      let mews = 0;
      if (analysis.dominant_bpm < 40 || analysis.dominant_bpm >= 130) mews += 3;
      else if (analysis.dominant_bpm < 50 || analysis.dominant_bpm >= 111) mews += 2;
      else if (analysis.dominant_bpm >= 101) mews += 1;

      if (analysis.respiration_brpm < 9 || analysis.respiration_brpm >= 30) mews += 3;
      else if (analysis.respiration_brpm >= 21) mews += 2;
      else if (analysis.respiration_brpm < 12) mews += 1;

      // Dispatch to Telegram
      const tgRes = await telegramService.forwardVitalBreachAlert({
        patientId,
        vitals: analysis,
        chartPath,
        anomalyReason: analysis.asystole_detected
          ? "CRITICAL ASYSTOLE / PULSELESSNESS"
          : mews >= 3
          ? `Elevated Clinical Risk (MEWS ${mews})`
          : "Full Video Telemetry Session Completed",
        mewsScore: mews,
      });

      // Log clinical event
      db.events.push({
        event_id: crypto.randomUUID(),
        patient_id: patientId,
        triggered_at: new Date().toISOString(),
        event_type: "FULL_CLINICAL_REPORT_GENERATED",
        severity: mews >= 5 ? "CRITICAL" : mews >= 2 ? "MODERATE" : "ROUTINE",
        payload: {
          vitals: {
            hr: analysis.dominant_bpm,
            rr: analysis.respiration_brpm,
            spo2: analysis.spo2_percent,
            rmssd: analysis.rmssd_ms,
            mews: mews,
          },
          reason: "Patient video ingestion complete",
        },
        chart_image_path: chartPath,
        status: "DISPATCHED",
        acknowledged: false,
      });
      db.persist();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "success",
          patient_id: patientId,
          chart_url: `/storage/photos/${chartFilename}`,
          telegram_status: tgRes.status,
          telegram_message_id: tgRes.telegram_message_id,
          vitals: {
            heart_rate_bpm: analysis.dominant_bpm,
            respiration_rate_brpm: analysis.respiration_brpm,
            spo2_percent: analysis.spo2_percent,
            perfusion_index: analysis.perfusion_index,
            hrv_rmssd_ms: analysis.rmssd_ms,
            hrv_sdnn_ms: analysis.sdnn_ms,
            hrv_lf_hf_ratio: analysis.lf_hf_ratio,
            mews_score: mews,
          },
          sppg_diagnostics: {
            contact_pressure_status: analysis.contact_pressure_status,
            asystole_detected: analysis.asystole_detected,
            sqi_metrics: analysis.sqi_metrics,
            sdppg_metrics: analysis.sdppg_metrics,
            tri_modal_respiration: analysis.tri_modal_respiration,
            crest_time_ms: analysis.pulse_crest_time_ms,
          },
        })
      );
      return;
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // FLOW 3: GET /api/v1/paramedic/events
  if (pathname === "/api/v1/paramedic/events" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([...db.events].reverse()));
    return;
  }

  // POST /api/v1/paramedic/events/:id/acknowledge
  if (pathname.startsWith("/api/v1/paramedic/events/") && pathname.endsWith("/acknowledge") && req.method === "POST") {
    const parts = pathname.split("/");
    const eventId = parts[parts.length - 2];
    const ev = db.events.find((e) => e.event_id === eventId);
    if (ev) {
      ev.acknowledged = true;
      ev.status = "ACKNOWLEDGED";
      db.persist();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success", event_id: eventId, state: "ACKNOWLEDGED" }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Event not found" }));
    }
    return;
  }

  // Root or unhandled
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      service: config.projectName,
      version: config.version,
      runtime: "Pure TypeScript Node.js 22",
      endpoints: {
        triage_photo: "POST /api/v1/triage/intake-photo",
        telemetry_batch: "POST /api/v1/telemetry/ingest-batch",
        telemetry_stream: "WSS /api/v1/telemetry/stream/:patient_id",
        paramedic_feed: "GET /api/v1/paramedic/events",
      },
    })
  );
});

// WebSocket Server for Continuous Telemetry Stream
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const match = url.pathname.match(/\/api\/v1\/telemetry\/stream\/([^/]+)/);
  const patientId = match ? match[1] : `PT-${Math.floor(10000 + Math.random() * 90000)}`;

  if (!patientBuffers.has(patientId)) {
    patientBuffers.set(patientId, []);
  }

  ws.on("message", async (msg: Buffer) => {
    try {
      const payload = JSON.parse(msg.toString("utf-8"));
      const samples = payload.samples || [];
      const isRgb =
        payload.sensor_type === "rppg_rgb" ||
        payload.sensor_type === "sppg_contact" ||
        (Array.isArray(samples[0]) && samples[0].length >= 3);
      const buffer = patientBuffers.get(patientId)!;

      for (const s of samples) {
        if (isRgb) {
          if (Array.isArray(s)) {
            (buffer as number[][]).push([s[0] ?? 0, s[1] ?? 0, s[2] ?? 0]);
          } else if (typeof s === "object" && s !== null) {
            (buffer as number[][]).push([s.r ?? 0, s.g ?? 0, s.b ?? 0]);
          }
        } else {
          (buffer as number[]).push(typeof s === "number" ? s : (s?.val ?? 0));
        }
      }

      // Maintain sliding window of 30 seconds (900 samples at 30Hz)
      const maxWindow = 30 * 30;
      if (buffer.length > maxWindow) {
        buffer.splice(0, buffer.length - maxWindow);
      }

      // Analyze window when we have >= 5 seconds of data (150 samples)
      if (buffer.length >= 150) {
        const { analysis, mews, anomalyDetected, reasonStr } = await evaluateVitalsAndEscalate(
          patientId,
          buffer,
          isRgb
        );

        const filtered = analysis.filtered_bvp || [];
        const recentWave = filtered.slice(-30);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              status: "active",
              heart_rate_bpm: analysis.dominant_bpm,
              respiration_rate_brpm: analysis.respiration_brpm,
              spo2_percent: analysis.spo2_percent,
              hrv_rmssd_ms: analysis.rmssd_ms,
              mews_score: mews,
              anomaly_detected: anomalyDetected,
              anomaly_reason: reasonStr,
              wave_slice: recentWave,
            })
          );
        }
      }
    } catch (e) {}
  });

  ws.on("close", () => {
    // Keep buffer for a while
  });
});

server.listen(config.port, config.host, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 PulseGuard TypeScript Backend Server Running!`);
  console.log(`📡 URL: http://${config.host}:${config.port}`);
  console.log(`🔌 WebSocket Stream: ws://${config.host}:${config.port}/api/v1/telemetry/stream/:id`);
  console.log(`📁 Storage: ${config.storageDir}`);
  console.log(`======================================================\n`);
});
