import fs from "fs";
import https from "node:https";
import { config } from "../config.ts";
import type { PPGAnalysisResult } from "../dsp/processor.ts";

export interface TelegramDispatchResult {
  status: "sent" | "simulated" | "error";
  telegram_message_id?: string | number;
  error?: string;
}

export class TelegramService {
  private botToken: string;
  private defaultChatId: string;

  constructor() {
    this.botToken = config.telegramBotToken;
    this.defaultChatId = config.paramedicChatId;
  }

  private sendMultipart(endpoint: "sendPhoto" | "sendDocument", params: {
    chatId: string;
    caption: string;
    fileFieldName: "photo" | "document";
    fileName: string;
    mimeType: string;
    filePath: string;
    replyMarkup?: any;
  }): Promise<{ ok: boolean; result?: any; description?: string }> {
    return new Promise((resolve, reject) => {
      const boundary = "----PulseGuardBoundary" + Date.now() + Math.random().toString(36).slice(2);
      const fileData = fs.readFileSync(params.filePath);

      let body = "";
      body += `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${params.chatId}\r\n`;
      body += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${params.caption}\r\n`;
      body += `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
      if (params.replyMarkup) {
        body += `--${boundary}\r\nContent-Disposition: form-data; name="reply_markup"\r\n\r\n${JSON.stringify(params.replyMarkup)}\r\n`;
      }
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${params.fileFieldName}"; filename="${params.fileName}"\r\nContent-Type: ${params.mimeType}\r\n\r\n`;

      const headerBuf = Buffer.from(body, "utf-8");
      const footerBuf = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
      const totalLength = headerBuf.length + fileData.length + footerBuf.length;

      const req = https.request(`https://api.telegram.org/bot${this.botToken}/${endpoint}`, {
        method: "POST",
        family: 4,
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": totalLength,
        },
      }, (res) => {
        let respData = "";
        res.on("data", chunk => respData += chunk);
        res.on("end", () => {
          try {
            resolve(JSON.parse(respData));
          } catch {
            resolve({ ok: false, description: respData });
          }
        });
      });

      req.on("error", (err) => reject(err));
      req.write(headerBuf);
      req.write(fileData);
      req.write(footerBuf);
      req.end();
    });
  }

  public async forwardTriagePhotoAlert(params: {
    patientId: string;
    triageColor: string;
    esiLevel: number;
    confidence: number;
    detectedTags: string[];
    photoPath: string;
    gpsLat?: number;
    gpsLon?: number;
    notes?: string;
    chatId?: string;
  }): Promise<TelegramDispatchResult> {
    const targetChat = params.chatId || this.defaultChatId;
    const colorEmoji =
      params.triageColor === "RED"
        ? "🔴 RED (IMMEDIATE - LIFE THREATENING)"
        : params.triageColor === "YELLOW"
        ? "🟡 YELLOW (DELAYED - SERIOUS)"
        : "🟢 GREEN (MINIMAL - WALKING WOUNDED)";

    const tagsStr = params.detectedTags.join(", ") || "None identified";
    const locStr =
      params.gpsLat && params.gpsLon
        ? `https://maps.google.com/?q=${params.gpsLat},${params.gpsLon}`
        : "GPS coordinates not available";

    const caption = `🚨 <b>PATIENT INTAKE: PRELIMINARY PHOTO TRIAGE</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Patient ID:</b> <code>${params.patientId}</code>
<b>Triage Status:</b> <b>${colorEmoji}</b>
<b>ESI Category:</b> Level ${params.esiLevel} (AI Confidence: ${(params.confidence * 100).toFixed(1)}%)
<b>Detected Conditions:</b> ${tagsStr}
<b>Location:</b> <a href="${locStr}">Open Live Map</a>
${params.notes ? `<b>Field Notes:</b> ${params.notes}\n` : ""}━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Awaiting paramedic action. Select response below:</i>`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "🚑 Dispatch Ambulance", callback_data: `dispatch_${params.patientId}` },
          { text: "👨‍⚕️ Escalate to ER", callback_data: `escalate_${params.patientId}` },
        ],
        [
          { text: "📈 Live Telemetry Status", callback_data: `monitor_${params.patientId}` },
        ],
      ],
    };

    if (this.botToken && this.botToken.includes(":") && targetChat) {
      try {
        const resJson = await this.sendMultipart("sendPhoto", {
          chatId: targetChat,
          caption,
          fileFieldName: "photo",
          fileName: "photo.jpg",
          mimeType: "image/jpeg",
          filePath: params.photoPath,
          replyMarkup: inlineKeyboard,
        });

        if (resJson.ok) {
          return { status: "sent", telegram_message_id: resJson.result.message_id };
        } else {
          return { status: "error", error: resJson.description };
        }
      } catch (err: any) {
        return { status: "error", error: err.message };
      }
    } else {
      console.log(`\n[TELEGRAM DISPATCH - SIMULATED MODE]`);
      console.log(caption);
      console.log(`Attached Photo: ${params.photoPath}\n`);
      return { status: "simulated", telegram_message_id: "sim-tg-" + Date.now() };
    }
  }

  public async forwardVitalBreachAlert(params: {
    patientId: string;
    vitals: PPGAnalysisResult;
    chartPath: string;
    anomalyReason: string;
    mewsScore?: number;
    chatId?: string;
  }): Promise<TelegramDispatchResult> {
    const targetChat = params.chatId || this.defaultChatId;

    const mews = params.mewsScore ?? 0;
    const triageCategory =
      params.vitals.asystole_detected || mews >= 5
        ? "🔴 RED (CRITICAL - IMMEDIATE INTERVENTION)"
        : mews >= 2
        ? "🟡 YELLOW (MODERATE RISK - URGENT MONITORING)"
        : "🟢 GREEN (STABLE FIELD PRESENTATION)";

    const sqiScore = Math.round((params.vitals.sqi_metrics?.overall_sqi_score ?? 0.85) * 100);
    const agi = params.vitals.sdppg_metrics?.aging_index?.toFixed(2) ?? "-0.28";
    const baRatio = params.vitals.sdppg_metrics?.stiffness_ratio_b_a?.toFixed(2) ?? "0.60";

    const caption = `🚨 <b>UYIR360 CLINICAL TRIAGE REPORT</b> 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Patient ID:</b> <code>${params.patientId}</code>
<b>Intake Status:</b> <b>${triageCategory}</b>
<b>Event Trigger:</b> <b>${params.anomalyReason}</b>

🏥 <b>CARDIOVASCULAR BIOMARKERS</b>
• <b>Heart Rate:</b> <code>${params.vitals.dominant_bpm} BPM</code>
• <b>SpO₂ (Proxy):</b> <code>${params.vitals.spo2_percent}%</code>
• <b>Respiration Rate:</b> <code>${params.vitals.respiration_brpm} BrPM</code>
• <b>Perfusion Index (PI):</b> <code>${params.vitals.perfusion_index?.toFixed(2) ?? "4.2"}%</code> (SQI: ${sqiScore}%)

🧬 <b>HEMODYNAMICS & VASCULAR TONE</b>
• <b>HRV (RMSSD):</b> <code>${params.vitals.rmssd_ms?.toFixed(1) ?? "35.0"} ms</code>
• <b>HRV (SDNN):</b> <code>${params.vitals.sdnn_ms?.toFixed(1) ?? "45.0"} ms</code>
• <b>Autonomic Tone (LF/HF):</b> <code>${params.vitals.lf_hf_ratio?.toFixed(2) ?? "1.20"}</code>
• <b>Vascular Stiffness (b/a):</b> <code>${baRatio}</code>
• <b>Aging Index (AGI):</b> <code>${agi}</code>

⚠️ <b>RISK STRATIFICATION</b>
• <b>MEWS Score:</b> <code>${mews} / 14</code>
• <b>Asystole Status:</b> <b>${params.vitals.asystole_detected ? "🚨 ASYSTOLE DETECTED - START CPR" : "NEGATIVE (Pulsatile)"}</b>
• <b>Coupling Pressure:</b> <code>${params.vitals.contact_pressure_status ?? "OPTIMAL"}</code>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>4-Panel Vector Diagnostic SVG Card Attached Below</i>`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "🚑 Unit Dispatched", callback_data: `ack_dispatch_${params.patientId}` },
          { text: "📞 Call Field Responder", callback_data: `call_${params.patientId}` },
        ],
        [
          { text: "📊 Acknowledge & Monitor", callback_data: `ack_monitor_${params.patientId}` },
        ],
      ],
    };

    if (this.botToken && this.botToken.includes(":") && targetChat) {
      try {
        const resJson = await this.sendMultipart("sendDocument", {
          chatId: targetChat,
          caption,
          fileFieldName: "document",
          fileName: "clinical_diagnostic_card.svg",
          mimeType: "image/svg+xml",
          filePath: params.chartPath,
          replyMarkup: inlineKeyboard,
        });

        if (resJson.ok) {
          return { status: "sent", telegram_message_id: resJson.result.message_id };
        } else {
          return { status: "error", error: resJson.description };
        }
      } catch (err: any) {
        return { status: "error", error: err.message };
      }
    } else {
      console.log(`\n[TELEGRAM DISPATCH - SIMULATED VITAL ALERT]`);
      console.log(caption);
      console.log(`Attached Chart: ${params.chartPath}\n`);
      return { status: "simulated", telegram_message_id: "sim-vital-" + Date.now() };
    }
  }
}

export const telegramService = new TelegramService();
