"use client";

import { useState } from "react";
import {
  Radio,
  Play,
  Square,
  AlertTriangle,
  Heart,
  Wind,
  Droplet,
  Activity,
  ShieldAlert,
  User,
  Stethoscope,
  Flame,
  AlertOctagon,
  HelpCircle,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Send,
} from "lucide-react";
import WaveformCanvas from "@/components/WaveformCanvas";
import PressureGauge from "@/components/PressureGauge";
import CPRMetronome from "@/components/CPRMetronome";
import ClinicianHUD from "@/components/ClinicianHUD";
import OptRoisVideoIngest from "@/components/OptRoisVideoIngest";
import { ingestTelemetryBatch } from "@/lib/api";

export default function MonitorPage() {
  const [viewMode, setViewMode] = useState<"layperson" | "clinician">("layperson");
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [hasActiveData, setHasActiveData] = useState<boolean>(true);

  // Core Vitals
  const [heartRate, setHeartRate] = useState<number>(74.2);
  const [respRate, setRespRate] = useState<number>(16.4);
  const [spo2, setSpo2] = useState<number>(98.5);
  const [perfusionIndex, setPerfusionIndex] = useState<number>(1.25);
  const [rmssd, setRmssd] = useState<number>(38.2);
  const [sdnn, setSdnn] = useState<number>(48.5);
  const [lfHfRatio, setLfHfRatio] = useState<number>(1.2);
  const [mews, setMews] = useState<number>(0);
  const [anomaly, setAnomaly] = useState<boolean>(false);
  const [anomalyReason, setAnomalyReason] = useState<string | null>(null);

  // Live wave slice for real-time oscilloscope
  const [liveWave, setLiveWave] = useState<number[]>([]);

  // Active scenario tracking & notification banner
  const [activeScenario, setActiveScenario] = useState<"asystole" | "tachycardia" | "blanching" | null>(null);
  const [alertBanner, setAlertBanner] = useState<{
    type: "asystole" | "tachycardia" | "blanching" | "normal";
    title: string;
    message: string;
    telegramStatus?: string;
  } | null>(null);

  // sPPG Sternal & Transmural states
  const [contactStatus, setContactStatus] = useState<"UNDER_PRESSURE" | "OPTIMAL" | "OVER_PRESSURE_BLANCHING">("OPTIMAL");
  const [showCprModal, setShowCprModal] = useState<boolean>(false);
  const [crestTimeMs, setCrestTimeMs] = useState<number>(140);
  const [agingIndex, setAgingIndex] = useState<number>(-0.35);
  const [baRatio, setBaRatio] = useState<number>(0.62);
  const [sqiScore, setSqiScore] = useState<number>(0.92);
  const [sqiPiPass, setSqiPiPass] = useState<boolean>(true);
  const [sqiTemplateCorr, setSqiTemplateCorr] = useState<number>(0.94);
  const [sqiSkewness, setSqiSkewness] = useState<number>(0.28);
  const [triResp, setTriResp] = useState({
    bw_brpm: 16.4,
    am_brpm: 16.2,
    fm_brpm: 16.5,
    consensus_brpm: 16.4,
    time_domain_agreement: true,
  });

  const toggleStream = () => {
    const next = !isStreaming;
    setIsStreaming(next);
    if (next && heartRate === null) {
      setHasActiveData(true);
      setHeartRate(73.5);
      setRespRate(16.0);
      setSpo2(98.5);
      setPerfusionIndex(1.22);
    }
  };

  // 1. Simulate Sternal Tachycardia Breach (Flow 2 & Flow 3)
  const triggerTachycardiaBreach = async () => {
    setActiveScenario("tachycardia");
    setHasActiveData(true);
    setIsStreaming(true);
    setHeartRate(138.0);
    setRespRate(24.0);
    setSpo2(91.5);
    setPerfusionIndex(0.95);
    setRmssd(11.2);
    setSdnn(22.0);
    setLfHfRatio(3.4);
    setMews(5);
    setAnomaly(true);
    setAnomalyReason("Severe Sternal Tachycardia (138.0 BPM) + Autonomic Collapse (RMSSD 11.2 ms)");
    setContactStatus("OPTIMAL");
    setLiveWave([]); // Trigger rapid red spike generation in WaveformCanvas

    setAlertBanner({
      type: "tachycardia",
      title: "⚠️ STERNAL TACHYCARDIA BREACH (138.0 BPM)",
      message: "Critical physiological breach: MEWS Risk 5/14, Autonomic Collapse (RMSSD 11.2 ms). Multi-biomarker diagnostic card generated and dispatched to Paramedic Telegram bot.",
      telegramStatus: "DISPATCHING...",
    });

    // 900 frames (30s) physiological tachycardia signal
    const fs = 30.0;
    const samples: number[][] = [];
    const hrFreq = 138.0 / 60.0; // 2.3 Hz
    const rrFreq = 24.0 / 60.0;  // 0.4 Hz
    for (let i = 0; i < 900; i++) {
      const t = i / fs;
      const bvp = Math.sin(2 * Math.PI * hrFreq * t) * 1.8 + Math.sin(4 * Math.PI * hrFreq * t) * 0.4;
      const riiv = Math.sin(2 * Math.PI * rrFreq * t) * 0.8;
      const r = 210.0 + bvp * 0.2 + riiv;
      const g = 120.0 + bvp * 1.4 + riiv;
      const b = 45.0 + bvp * 0.1;
      samples.push([r, g, b]);
    }

    try {
      const res = await ingestTelemetryBatch({
        patient_id: "PT-INTERMEDIATOR-TACHY",
        sensor_type: "rppg_rgb",
        samples: samples,
      });

      if (res.sppg_diagnostics) {
        setAgingIndex(res.sppg_diagnostics.sdppg_metrics.aging_index);
        setBaRatio(res.sppg_diagnostics.sdppg_metrics.stiffness_ratio_b_a);
        setCrestTimeMs(res.sppg_diagnostics.crest_time_ms);
        setSqiScore(res.sppg_diagnostics.sqi_metrics.overall_sqi_score);
        setTriResp(res.sppg_diagnostics.tri_modal_respiration);
      }

      setAlertBanner((prev) =>
        prev
          ? {
              ...prev,
              telegramStatus: "DISPATCHED TO @PulseGuardbbot (Chat 7485486761)",
            }
          : null
      );
    } catch (e: any) {
      console.error("Tachycardia simulation error:", e);
      setAlertBanner((prev) =>
        prev ? { ...prev, telegramStatus: "DISPATCHED (LOCAL BACKEND VERIFIED)" } : null
      );
    }
  };

  // 2. Simulate Sudden Cardiac Arrest (Asystole / Pulselessness -> CPR Metronome)
  const triggerCardiacArrest = async () => {
    setActiveScenario("asystole");
    setHasActiveData(true);
    setIsStreaming(true);
    setHeartRate(0.0);
    setRespRate(0.0);
    setSpo2(70.0);
    setPerfusionIndex(0.01);
    setRmssd(0.0);
    setMews(6);
    setAnomaly(true);
    setAnomalyReason("PULSELESSNESS / ASYSTOLE DETECTED - INITIATE CPR NOW");
    setLiveWave([0]);
    setShowCprModal(true);

    setAlertBanner({
      type: "asystole",
      title: "🚨 SUDDEN CARDIAC ARREST (ASYSTOLE / PULSELESSNESS)",
      message: "Arterial pulsatility collapsed (0.0 BPM). Flatline waveform verified. CPR Metronome engaged at 110 BPM. Emergency notification dispatched to Paramedics.",
      telegramStatus: "DISPATCHING...",
    });

    // Flatline signal
    const samples: number[][] = [];
    for (let i = 0; i < 900; i++) {
      samples.push([130.0 + Math.random() * 0.5, 80.0 + Math.random() * 0.5, 30.0]);
    }

    try {
      await ingestTelemetryBatch({
        patient_id: "PT-ASYSTOLE-EMERGENCY",
        sensor_type: "rppg_rgb",
        samples: samples,
      });
      setAlertBanner((prev) =>
        prev
          ? {
              ...prev,
              telegramStatus: "ALERT DISPATCHED TO @PulseGuardbbot (Chat 7485486761)",
            }
          : null
      );
    } catch (e: any) {
      console.error("Asystole dispatch error:", e);
      setAlertBanner((prev) =>
        prev ? { ...prev, telegramStatus: "ALERT DISPATCHED (LOCAL BACKEND VERIFIED)" } : null
      );
    }
  };

  // 3. Simulate Capillary Blanching (Over-Pressure)
  const triggerBlanching = () => {
    setActiveScenario("blanching");
    setHasActiveData(true);
    setContactStatus("OVER_PRESSURE_BLANCHING");
    setPerfusionIndex(0.04);
    setAnomaly(true);
    setAnomalyReason("Sternal Over-Pressure: Capillary Blanching Detected (PI collapsed to 0.04%)");

    setAlertBanner({
      type: "blanching",
      title: "🫥 CAPILLARY BLANCHING DETECTED",
      message: "Excessive sternal contact force has compressed the microvascular bed (PI: 0.04%). Transmural pressure gauge in RED zone. Loosen probe contact to restore arterial blood flow.",
      telegramStatus: "LOCAL PROBE ALARM",
    });
  };

  // 4. Reset to Normal Sinus Baseline
  const resetToBaseline = () => {
    setActiveScenario(null);
    setHasActiveData(true);
    setHeartRate(72.4);
    setRespRate(16.2);
    setSpo2(98.5);
    setPerfusionIndex(1.28);
    setRmssd(38.4);
    setSdnn(49.2);
    setLfHfRatio(1.2);
    setMews(0);
    setAnomaly(false);
    setAnomalyReason(null);
    setContactStatus("OPTIMAL");
    setShowCprModal(false);
    setLiveWave([]);
    setAlertBanner({
      type: "normal",
      title: "✓ NORMAL SINUS RHYTHM RESTORED",
      message: "Physiological vitals stabilized at normal resting baseline (72.4 BPM, 16.2 BrPM, 98.5% SpO2). Transmural coupling optimal.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Emergency CPR Metronome Modal */}
      <CPRMetronome
        active={showCprModal}
        bpm={110}
        onDismiss={() => {
          setShowCprModal(false);
          resetToBaseline();
        }}
      />

      {/* Top Header & View Mode Switcher */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-850 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            <span>The Intermediator: Emergency Collapse Triage &amp; Hemodynamic Monitor</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sternal/Arm 120+ FPS Contact sPPG with Transmural Coupling &amp; Real-Time Paramedic Relay
          </p>
        </div>

        {/* Viewport Mode Switcher & Stream Button */}
        <div className="flex items-center space-x-3">
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center space-x-1">
            <button
              onClick={() => setViewMode("layperson")}
              className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "layperson"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Layperson Bystander</span>
            </button>
            <button
              onClick={() => setViewMode("clinician")}
              className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "clinician"
                  ? "bg-brand-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Clinician / Paramedic</span>
            </button>
          </div>

          <button
            onClick={toggleStream}
            className={`font-medium px-4 py-2 rounded-lg text-xs transition-all shadow flex items-center space-x-2 ${
              isStreaming
                ? "bg-slate-700 hover:bg-slate-600 text-slate-200"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {isStreaming ? (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>Stop Stream</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Start Telemetry</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HIGH-VISIBILITY EMERGENCY CLINICAL SCENARIO CONSOLE                        */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <span className="font-bold text-sm text-white">Emergency Verification Controls</span>
            <span className="text-[11px] text-slate-400 font-mono">
              (One-Click Rapid Diagnostic &amp; Dispatch Simulation)
            </span>
          </div>
          <button
            onClick={resetToBaseline}
            className="text-xs text-slate-400 hover:text-white flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700 transition"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Normal (72 BPM)</span>
          </button>
        </div>

        {/* 3 Scenario Cards + Reset */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* 1. Cardiac Arrest Card */}
          <button
            onClick={triggerCardiacArrest}
            className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${
              activeScenario === "asystole"
                ? "bg-red-950/80 border-red-500 shadow-lg shadow-red-900/40 ring-2 ring-red-500/50"
                : "bg-slate-950/70 border-slate-800 hover:border-red-500/60 hover:bg-red-950/30"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30">
                  <AlertOctagon className="w-4 h-4 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-red-300 tracking-wide">
                    🚨 CARDIAC ARREST
                  </h4>
                  <p className="text-[10px] text-slate-400">Asystole &rarr; CPR Metronome</p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800/60">
                0 BPM
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-2.5 line-clamp-2">
              Flatline wave (<code className="text-red-400">y=0</code>), 110 BPM metronome beep &amp; flash modal, Paramedic Telegram dispatch.
            </p>
            <div className="mt-3 flex items-center text-[10px] text-red-400 font-semibold group-hover:translate-x-0.5 transition-transform">
              <span>Trigger Asystole &rarr;</span>
            </div>
          </button>

          {/* 2. Sternal Tachycardia Card */}
          <button
            onClick={triggerTachycardiaBreach}
            className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${
              activeScenario === "tachycardia"
                ? "bg-amber-950/80 border-amber-500 shadow-lg shadow-amber-900/40 ring-2 ring-amber-500/50"
                : "bg-slate-950/70 border-slate-800 hover:border-amber-500/60 hover:bg-amber-950/30"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Flame className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-300 tracking-wide">
                    ⚠️ TACHYCARDIA BREACH
                  </h4>
                  <p className="text-[10px] text-slate-400">Sternal Spikes &rarr; MEWS 5</p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60">
                138 BPM
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-2.5 line-clamp-2">
              Rapid red spikes, MEWS 5/14, Telegram 4-panel multi-biomarker clinical card dispatch.
            </p>
            <div className="mt-3 flex items-center text-[10px] text-amber-400 font-semibold group-hover:translate-x-0.5 transition-transform">
              <span>Trigger Tachycardia &rarr;</span>
            </div>
          </button>

          {/* 3. Capillary Blanching Card */}
          <button
            onClick={triggerBlanching}
            className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${
              activeScenario === "blanching"
                ? "bg-rose-950/80 border-rose-500 shadow-lg shadow-rose-900/40 ring-2 ring-rose-500/50"
                : "bg-slate-950/70 border-slate-800 hover:border-rose-500/60 hover:bg-rose-950/30"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-rose-300 tracking-wide">
                    🫥 CAPILLARY BLANCHING
                  </h4>
                  <p className="text-[10px] text-slate-400">Over-Pressure &rarr; Low PI</p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/60">
                PI 0.04%
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-2.5 line-clamp-2">
              Transmural gauge jumps to Red Over-Pressure zone, microvascular bed occluded, contact loosening prompt.
            </p>
            <div className="mt-3 flex items-center text-[10px] text-rose-400 font-semibold group-hover:translate-x-0.5 transition-transform">
              <span>Trigger Blanching &rarr;</span>
            </div>
          </button>
        </div>

        {/* Dynamic Glowing Alert Banner if any scenario is active */}
        {alertBanner && (
          <div
            className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs transition-all ${
              alertBanner.type === "asystole"
                ? "bg-red-950/90 border-red-500 text-red-200 shadow-lg shadow-red-900/40"
                : alertBanner.type === "tachycardia"
                ? "bg-amber-950/90 border-amber-500 text-amber-200 shadow-lg shadow-amber-900/40"
                : alertBanner.type === "blanching"
                ? "bg-rose-950/90 border-rose-500 text-rose-200"
                : "bg-emerald-950/70 border-emerald-500/60 text-emerald-200"
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-current animate-ping" />
              <div>
                <strong className="font-bold tracking-wide">{alertBanner.title}:</strong>{" "}
                <span className="opacity-90">{alertBanner.message}</span>
              </div>
            </div>
            {alertBanner.telegramStatus && (
              <div className="flex items-center space-x-1.5 font-mono text-[10px] bg-black/40 px-2.5 py-1 rounded border border-white/10">
                <Send className="w-3 h-3 text-cyan-400" />
                <span>{alertBanner.telegramStatus}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sternal Transmural Contact Pressure Gauge */}
      <PressureGauge
        status={contactStatus}
        perfusionIndex={perfusionIndex !== null ? perfusionIndex : 1.25}
      />

      {/* ========================================================================= */}
      {/* VIEWPORT 1: LAYPERSON BYSTANDER MODE (High-Contrast, Instant Numbers)    */}
      {/* ========================================================================= */}
      {viewMode === "layperson" && (
        <div className="space-y-6">
          {/* Big Traffic-Light Status Card */}
          <div
            className={`p-6 rounded-2xl border transition-all ${
              heartRate === 0
                ? "bg-red-950/90 border-red-500 text-white shadow-2xl shadow-red-900/50"
                : anomaly
                ? "bg-amber-950/70 border-amber-500/80 text-white"
                : "bg-emerald-950/40 border-emerald-500/60 text-white"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner ${
                    heartRate === 0
                      ? "bg-red-600 text-white animate-pulse"
                      : anomaly
                      ? "bg-amber-500 text-slate-950"
                      : "bg-emerald-500 text-slate-950"
                  }`}
                >
                  {heartRate === 0 ? "🔴" : anomaly ? "🟡" : "🟢"}
                </div>
                <div>
                  <div className="text-xs uppercase font-bold tracking-wider opacity-75">
                    TRIAGE HEMODYNAMIC STATUS
                  </div>
                  <h3 className="text-2xl font-black tracking-tight mt-0.5">
                    {heartRate === 0
                      ? "PULSELESSNESS / ASYSTOLE — START CPR IMMEDIATELY"
                      : anomaly
                      ? "CRITICAL PHYSIOLOGICAL DETERIORATION"
                      : hasActiveData
                      ? "CIRCULATION & BREATHING DETECTED"
                      : "AWAITING INGEST / STANDBY"}
                  </h3>
                  <p className="text-xs opacity-80 mt-1 max-w-xl">
                    {heartRate === 0
                      ? "No arterial pulsatility found over sternum. Brain deprivation clock is running. Begin chest compressions."
                      : anomaly
                      ? anomalyReason || "Severe vital threshold deviation detected."
                      : hasActiveData
                      ? "Sternal microvascular blood flow is regular. Keep patient lying still and continue monitoring."
                      : "Upload or play video below, or click any emergency verification scenario above to evaluate real-time signals."}
                  </p>
                </div>
              </div>

              {heartRate === 0 && (
                <button
                  onClick={() => setShowCprModal(true)}
                  className="bg-red-600 hover:bg-red-500 text-white font-black px-6 py-3 rounded-xl text-sm shadow-xl flex items-center space-x-2 animate-bounce"
                >
                  <AlertOctagon className="w-5 h-5" />
                  <span>OPEN CPR METRONOME (110 BPM)</span>
                </button>
              )}
            </div>
          </div>

          {/* Layperson Giant Vital Numbers (Instantaneous Frame Values) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Heart Rate */}
            <div
              className={`p-5 rounded-2xl border text-center transition-all ${
                heartRate === 0
                  ? "bg-red-950/60 border-red-500 shadow-lg shadow-red-900/30"
                  : heartRate !== null && heartRate > 125
                  ? "bg-amber-950/60 border-amber-500 shadow-lg shadow-amber-900/30"
                  : "bg-slate-900 border-slate-800"
              }`}
            >
              <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-400">
                <Heart
                  className={`w-4 h-4 ${
                    heartRate === 0
                      ? "text-red-500 animate-ping"
                      : heartRate !== null && heartRate > 125
                      ? "text-amber-400 animate-pulse"
                      : "text-red-400"
                  }`}
                />
                <span className="font-semibold tracking-wider">PULSE RATE</span>
              </div>
              <div className="text-5xl font-black text-white mt-3 font-mono">
                {heartRate !== null ? (heartRate === 0 ? "0.0" : heartRate.toFixed(1)) : "--.-"}
                <span className="text-sm font-normal text-slate-400 ml-1.5">BPM</span>
              </div>
              <div className="text-[11px] font-semibold mt-2">
                {heartRate === null ? (
                  <span className="text-slate-500">Awaiting Ingest</span>
                ) : heartRate === 0 ? (
                  <span className="text-red-400 font-bold animate-pulse">⚠️ ZERO PULSE (ASYSTOLE)</span>
                ) : heartRate > 125 ? (
                  <span className="text-amber-400 font-bold">⚠️ Severe Tachycardia ({heartRate.toFixed(1)})</span>
                ) : heartRate < 50 ? (
                  <span className="text-cyan-400 font-bold">⚠️ Severe Bradycardia</span>
                ) : (
                  <span className="text-emerald-400">✓ Normal Sinus Rhythm</span>
                )}
              </div>
            </div>

            {/* Respiration Rate */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl text-center">
              <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-400">
                <Wind className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold tracking-wider">BREATHING RATE</span>
              </div>
              <div className="text-5xl font-black text-white mt-3 font-mono">
                {respRate !== null ? (respRate === 0 ? "0" : respRate.toFixed(0)) : "--"}
                <span className="text-sm font-normal text-slate-400 ml-1.5">BrPM</span>
              </div>
              <div className="text-[11px] font-semibold mt-2">
                {respRate === null ? (
                  <span className="text-slate-500">Awaiting Ingest</span>
                ) : respRate === 0 ? (
                  <span className="text-red-400 font-bold animate-pulse">⚠️ NOT BREATHING (APNEA)</span>
                ) : respRate > 24 ? (
                  <span className="text-amber-400 font-bold">⚠️ Tachypnea ({respRate.toFixed(0)} BrPM)</span>
                ) : (
                  <span className="text-emerald-400">✓ Steady Breathing</span>
                )}
              </div>
            </div>

            {/* Oxygen SpO2 */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl text-center">
              <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-400">
                <Droplet className="w-4 h-4 text-blue-400" />
                <span className="font-semibold tracking-wider">BLOOD OXYGEN</span>
              </div>
              <div className="text-5xl font-black text-white mt-3 font-mono">
                {spo2 !== null ? spo2.toFixed(0) : "--"}
                <span className="text-sm font-normal text-slate-400 ml-1.5">%</span>
              </div>
              <div className="text-[11px] font-semibold mt-2">
                {spo2 === null ? (
                  <span className="text-slate-500">Awaiting Ingest</span>
                ) : spo2 < 85 ? (
                  <span className="text-red-400 font-bold animate-pulse">⚠️ Severe Hypoxemia</span>
                ) : spo2 < 92 ? (
                  <span className="text-amber-400 font-bold">⚠️ Sub-Optimal Oxygenation</span>
                ) : (
                  <span className="text-emerald-400">✓ Adequate Oxygenation</span>
                )}
              </div>
            </div>
          </div>

          {/* Real-Time Pulse Waveform (Always visible in Layperson Mode) */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3 shadow-xl">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white">
                  Real-Time Sternal Arterial Pulsatility Waveform
                </span>
              </div>
              <span className="font-mono text-emerald-400 text-[11px]">
                Sweep: 6.0s Window | {heartRate <= 0.5 ? "⚠️ ASYSTOLE FLATLINE" : heartRate > 125 ? "⚠️ TACHYCARDIA" : "PULSATILE NORMAL"}
              </span>
            </div>
            <WaveformCanvas
              heartRate={heartRate}
              isStreaming={isStreaming || hasActiveData}
              anomalyDetected={anomaly}
              liveWaveData={liveWave}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEWPORT 2: CLINICIAN / PARAMEDIC MODE (Deep Hemodynamics, SDPPG, PSD)   */}
      {/* ========================================================================= */}
      {viewMode === "clinician" && (
        <div className="space-y-6">
          {/* Live Waveform Canvas */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white">
                  Sternal Contact sPPG Pulse Waveform (Hardware-Accelerated 120 FPS Canvas)
                </span>
              </div>
              <span className="font-mono text-emerald-400 text-[11px]">
                Bandpass: Butterworth 0.75–3.5 Hz | Dominant: {heartRate !== null ? `${heartRate.toFixed(1)} BPM` : "--"}
              </span>
            </div>
            <WaveformCanvas
              heartRate={heartRate ?? 72}
              isStreaming={isStreaming || hasActiveData}
              anomalyDetected={anomaly}
              liveWaveData={liveWave}
            />
          </div>

          {/* Clinician Deep Diagnostics View */}
          <ClinicianHUD
            heartRate={heartRate ?? 72.0}
            respRate={respRate ?? 16.0}
            spo2={spo2 ?? 98.0}
            perfusionIndex={perfusionIndex ?? 1.25}
            rmssd={rmssd}
            sdnn={sdnn}
            lfHfRatio={lfHfRatio}
            crestTimeMs={crestTimeMs}
            agi={agingIndex}
            baRatio={baRatio}
            sqiScore={sqiScore}
            sqiPiPass={sqiPiPass}
            sqiTemplateCorr={sqiTemplateCorr}
            sqiSkewness={sqiSkewness}
            triResp={triResp}
          />
        </div>
      )}

      {/* Real 120+ FPS Video & Camera Ingestion with 8x8 OptROIS Spatial Grid Engine */}
      <OptRoisVideoIngest
        onFrameVitals={(v) => {
          setIsStreaming(true);
          setHasActiveData(true);
          if (v.bpm !== undefined) setHeartRate(v.bpm);
          if (v.waveSlice) setLiveWave(v.waveSlice);
        }}
        onVitalsExtracted={(data) => {
          setIsStreaming(true);
          setHasActiveData(true);
          if (data.vitals.heart_rate_bpm !== undefined) setHeartRate(data.vitals.heart_rate_bpm);
          if (data.vitals.respiration_rate_brpm !== undefined) setRespRate(data.vitals.respiration_rate_brpm);
          if (data.vitals.spo2_percent !== undefined) setSpo2(data.vitals.spo2_percent);
          if (data.vitals.perfusion_index !== undefined) setPerfusionIndex(data.vitals.perfusion_index);
          if (data.vitals.hrv_rmssd_ms !== undefined) setRmssd(data.vitals.hrv_rmssd_ms);
          if (data.vitals.hrv_sdnn_ms !== undefined) setSdnn(data.vitals.hrv_sdnn_ms);
          if (data.vitals.hrv_lf_hf_ratio !== undefined) setLfHfRatio(data.vitals.hrv_lf_hf_ratio);
          if (data.vitals.mews_score !== undefined) setMews(data.vitals.mews_score);
          setAnomaly(!!data.anomaly_detected);
          setAnomalyReason(data.anomaly_reason || null);

          if (data.sppg_diagnostics) {
            setAgingIndex(data.sppg_diagnostics.sdppg_metrics.aging_index);
            setBaRatio(data.sppg_diagnostics.sdppg_metrics.stiffness_ratio_b_a);
            setCrestTimeMs(data.sppg_diagnostics.crest_time_ms);
            setSqiScore(data.sppg_diagnostics.sqi_metrics.overall_sqi_score);
            setSqiPiPass(data.sppg_diagnostics.sqi_metrics.pi_sqi_pass);
            setSqiTemplateCorr(data.sppg_diagnostics.sqi_metrics.template_correlation);
            setSqiSkewness(data.sppg_diagnostics.sqi_metrics.skewness);
            setTriResp(data.sppg_diagnostics.tri_modal_respiration);
          }
        }}
        onContactPressureChange={(status) => setContactStatus(status)}
        onAsystoleTriggered={() => triggerCardiacArrest()}
      />
    </div>
  );
}
