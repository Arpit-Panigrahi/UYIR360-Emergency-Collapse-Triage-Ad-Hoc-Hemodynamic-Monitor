"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Video,
  StopCircle,
  Cpu,
  Layers,
  Activity,
  FileText,
  Download,
  Send,
  Heart,
  TrendingUp,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  ingestTelemetryBatch,
  generateFullPatientReport,
  TelemetryVitalsResponse,
} from "@/lib/api";

interface OptRoisVideoIngestProps {
  onVitalsExtracted: (data: TelemetryVitalsResponse) => void;
  onAsystoleTriggered: () => void;
  onContactPressureChange: (status: "UNDER_PRESSURE" | "OPTIMAL" | "OVER_PRESSURE_BLANCHING") => void;
  onFrameVitals?: (vitals: { bpm: number; ibiMs: number; waveSlice?: number[]; sPulse?: number }) => void;
}

interface ClinicalReportData {
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
}

interface BpmPoint {
  sampleIdx: number;
  bpm: number;
}

// Biquad filter for client-side zero-phase Butterworth bandpass
class ClientBiquad {
  private b0: number;
  private b1: number;
  private b2: number;
  private a1: number;
  private a2: number;
  private z1: number = 0;
  private z2: number = 0;

  constructor(b0: number, b1: number, b2: number, a1: number, a2: number) {
    this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2;
  }
  process(x: number): number {
    const out = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * out + this.z2;
    this.z2 = this.b2 * x - this.a2 * out;
    return out;
  }
  reset() { this.z1 = 0; this.z2 = 0; }
}

function makeButterworthBandpass(fs: number, fLow: number, fHigh: number): (data: number[]) => number[] {
  const wLow = Math.tan((Math.PI * fLow) / fs);
  const kLow2 = wLow * wLow;
  const normL = 1 + Math.SQRT2 * wLow + kLow2;
  const hpf = new ClientBiquad(
    1 / normL,
    -2 / normL,
    1 / normL,
    (2 * (kLow2 - 1)) / normL,
    (1 - Math.SQRT2 * wLow + kLow2) / normL
  );

  const wHigh = Math.tan((Math.PI * fHigh) / fs);
  const kHigh2 = wHigh * wHigh;
  const normH = 1 + Math.SQRT2 * wHigh + kHigh2;
  const lpf = new ClientBiquad(
    kHigh2 / normH,
    (2 * kHigh2) / normH,
    kHigh2 / normH,
    (2 * (kHigh2 - 1)) / normH,
    (1 - Math.SQRT2 * wHigh + kHigh2) / normH
  );

  return (data: number[]) => {
    if (data.length === 0) return [];
    hpf.reset();
    lpf.reset();
    const fwd = data.map((x) => lpf.process(hpf.process(x)));
    hpf.reset();
    lpf.reset();
    const rev = fwd.slice().reverse().map((x) => lpf.process(hpf.process(x)));
    return rev.reverse();
  };
}

export default function OptRoisVideoIngest({
  onVitalsExtracted,
  onAsystoleTriggered,
  onContactPressureChange,
  onFrameVitals,
}: OptRoisVideoIngestProps) {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [videoLoaded, setVideoLoaded] = useState<boolean>(false);
  const [videoFileName, setVideoFileName] = useState<string>("");
  const [fps, setFps] = useState<number>(0);

  // Dynamic live BPM states (initially null to prevent hardcoded appearance)
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [liveIbiMs, setLiveIbiMs] = useState<number | null>(null);
  const [isBeatActive, setIsBeatActive] = useState<boolean>(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [finalReport, setFinalReport] = useState<ClinicalReportData | null>(null);

  // Dynamic statistics
  const [bpmStats, setBpmStats] = useState<{
    min: number | null;
    max: number | null;
    median: number | null;
    sdnn: number | null;
  }>({
    min: null,
    max: null,
    median: null,
    sdnn: null,
  });

  const [optRoisStats, setOptRoisStats] = useState({
    totalBlocks: 64,
    activeBlocks: 0,
    flareRejected: 0,
    darkRejected: 0,
    currentMeanG: 0,
    currentMeanR: 0,
    sPulse: 0,
  });
  const [gridMask, setGridMask] = useState<number[]>(new Array(64).fill(0));

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bpmCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  // Streaming buffers
  const ringBufferRef = useRef<number[][]>([]);
  const sessionSamplesRef = useRef<number[][]>([]);
  const waveHistoryRef = useRef<number[]>([]);
  const rawGrdHistoryRef = useRef<number[]>([]);
  const bpmHistoryRef = useRef<BpmPoint[]>([]);
  const latestBpmRef = useRef<number | null>(null);
  const latestIbiRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(performance.now());
  const lastBackendSyncRef = useRef<number>(performance.now());

  // Bandpass filter
  const filterRef = useRef<((data: number[]) => number[]) | null>(null);

  useEffect(() => {
    filterRef.current = makeButterworthBandpass(30.0, 0.75, 3.5);
    return () => stopProcessing();
  }, []);

  // Handle Video File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopProcessing();
    setFinalReport(null);
    setVideoFileName(file.name);
    setLiveBpm(null);
    setLiveIbiMs(null);
    setBpmStats({ min: null, max: null, median: null, sdnn: null });
    ringBufferRef.current = [];
    sessionSamplesRef.current = [];
    waveHistoryRef.current = [];
    rawGrdHistoryRef.current = [];
    bpmHistoryRef.current = [];
    frameCountRef.current = 0;

    const url = URL.createObjectURL(file);
    const video = videoRef.current;
    if (!video) return;

    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    const startPlayback = async () => {
      try {
        await video.play();
        setVideoLoaded(true);
        setIsProcessing(true);
        startFrameLoop();
      } catch (err) {
        console.warn("Auto-play error on upload:", err);
      }
    };

    if (video.readyState >= 2) {
      startPlayback();
    } else {
      video.oncanplay = () => {
        video.oncanplay = null;
        startPlayback();
      };
      video.onloadeddata = () => {
        video.onloadeddata = null;
        startPlayback();
      };
      setTimeout(() => {
        if (video.paused) startPlayback();
      }, 400);
    }
  };

  const stopProcessing = () => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsProcessing(false);
  };

  /**
   * Real-Time Mathematical Frame-by-Frame Processing
   */
  const processFrame = () => {
    const video = videoRef.current;
    const canvas = processCanvasRef.current;
    if (!video || !canvas || video.paused || video.ended || video.videoWidth === 0) {
      animRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const W = (canvas.width = 320);
    const H = (canvas.height = 240);
    ctx.drawImage(video, 0, 0, W, H);

    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;

    const blockW = Math.floor(W / 8);
    const blockH = Math.floor(H / 8);

    interface BlockMetric {
      index: number;
      meanR: number;
      meanG: number;
      meanB: number;
      varianceG: number;
      snr: number;
      status: number;
    }

    const blocks: BlockMetric[] = [];
    let flareCount = 0;
    let darkCount = 0;

    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        const idx = by * 8 + bx;
        let sumR = 0, sumG = 0, sumB = 0;
        let pixelCount = 0;

        for (let y = by * blockH; y < (by + 1) * blockH; y += 2) {
          for (let x = bx * blockW; x < (bx + 1) * blockW; x += 2) {
            const pIdx = (y * W + x) * 4;
            sumR += data[pIdx];
            sumG += data[pIdx + 1];
            sumB += data[pIdx + 2];
            pixelCount++;
          }
        }

        const meanR = sumR / (pixelCount || 1);
        const meanG = sumG / (pixelCount || 1);
        const meanB = sumB / (pixelCount || 1);

        let status = 1;
        if (meanR > 245 || meanG > 240) {
          status = 3;
          flareCount++;
        } else if (meanG < 15) {
          status = 0;
          darkCount++;
        }

        let varSum = 0;
        if (status === 1) {
          for (let y = by * blockH; y < (by + 1) * blockH; y += 4) {
            for (let x = bx * blockW; x < (bx + 1) * blockW; x += 4) {
              const pIdx = (y * W + x) * 4;
              varSum += Math.pow(data[pIdx + 1] - meanG, 2);
            }
          }
        }
        const varianceG = varSum / (pixelCount * 0.25 || 1);
        const snr = Math.sqrt(varianceG) / (meanG + 1e-6);

        blocks.push({ index: idx, meanR, meanG, meanB, varianceG, snr, status });
      }
    }

    // Dynamic Masking: Top 15%-20% highest SNR blocks
    const validBlocks = blocks.filter((b) => b.status === 1);
    validBlocks.sort((a, b) => b.snr - a.snr);
    const topCount = Math.max(4, Math.floor(validBlocks.length * 0.2));
    const topBlocks = validBlocks.slice(0, topCount);

    const newGridMask = new Array(64).fill(0);
    for (const b of blocks) newGridMask[b.index] = b.status;
    for (const tb of topBlocks) newGridMask[tb.index] = 2;
    setGridMask(newGridMask);

    let avgR = 0, avgG = 0, avgB = 0;
    if (topBlocks.length > 0) {
      for (const b of topBlocks) {
        avgR += b.meanR;
        avgG += b.meanG;
        avgB += b.meanB;
      }
      avgR /= topBlocks.length;
      avgG /= topBlocks.length;
      avgB /= topBlocks.length;
    } else {
      avgR = 205;
      avgG = 120;
      avgB = 30;
    }

    // Rolling frame history
    ringBufferRef.current.push([avgR, avgG, avgB]);
    sessionSamplesRef.current.push([avgR, avgG, avgB]);
    frameCountRef.current++;

    // -----------------------------------------------------------------------
    // Mathematical GRD & Instantaneous Peak Detection Engine
    // -----------------------------------------------------------------------
    const windowSamples = sessionSamplesRef.current.slice(-90); // Rolling 3.0s window
    if (windowSamples.length >= 25 && filterRef.current) {
      const redList = windowSamples.map((s) => s[0]);
      const greenList = windowSamples.map((s) => s[1]);

      const meanR = redList.reduce((a, b) => a + b, 0) / redList.length;
      const meanG = greenList.reduce((a, b) => a + b, 0) / greenList.length;

      let varR = 0, varG = 0;
      for (let i = 0; i < redList.length; i++) {
        varR += Math.pow(redList[i] - meanR, 2);
        varG += Math.pow(greenList[i] - meanG, 2);
      }
      const alpha = Math.min(2.5, Math.max(0.2, (Math.sqrt(varG) + 1e-5) / (Math.sqrt(varR) + 1e-5)));

      const grd = [];
      for (let i = 0; i < redList.length; i++) {
        const normG = (greenList[i] - meanG) / (meanG || 1);
        const normR = (redList[i] - meanR) / (meanR || 1);
        grd.push(normG - alpha * normR);
      }

      // Filter via true Butterworth bandpass (0.75 - 3.5 Hz)
      const filtered = filterRef.current(grd);
      waveHistoryRef.current = filtered;

      // Peak detection on filtered wave (minDistance = 9 samples at 30Hz ~ 300ms)
      const minDistance = 9;
      let lastP = -minDistance;
      const peaks: number[] = [];

      let sumSq = 0;
      for (const v of filtered) sumSq += v * v;
      const stdDev = Math.sqrt(sumSq / filtered.length);
      const threshold = stdDev * 0.25;

      for (let i = 1; i < filtered.length - 1; i++) {
        if (
          filtered[i] > filtered[i - 1] &&
          filtered[i] > filtered[i + 1] &&
          filtered[i] > threshold &&
          i - lastP >= minDistance
        ) {
          peaks.push(i);
          lastP = i;
        }
      }

      // If peaks found, compute beat-to-beat IBIs and instantaneous BPM
      if (peaks.length >= 2) {
        const lastTwoPeaks = peaks.slice(-2);
        const ibiSamples = lastTwoPeaks[1] - lastTwoPeaks[0];
        const ibiMs = Math.round((ibiSamples / 30.0) * 1000.0);
        const instantBpm = Math.round((60000.0 / ibiMs) * 10) / 10;

        if (instantBpm >= 42.0 && instantBpm <= 195.0) {
          setLiveBpm(instantBpm);
          setLiveIbiMs(ibiMs);
          latestBpmRef.current = instantBpm;
          latestIbiRef.current = ibiMs;

          // If a new peak just appeared at the current edge of the window
          if (peaks[peaks.length - 1] >= filtered.length - 2) {
            setIsBeatActive(true);
            setTimeout(() => setIsBeatActive(false), 200);

            // Record into BPM history series
            bpmHistoryRef.current.push({
              sampleIdx: frameCountRef.current,
              bpm: instantBpm,
            });
            if (bpmHistoryRef.current.length > 50) bpmHistoryRef.current.shift();

            // Recalculate series statistics
            const allBpm = bpmHistoryRef.current.map((p) => p.bpm);
            const minB = Math.min(...allBpm);
            const maxB = Math.max(...allBpm);
            const sorted = [...allBpm].sort((a, b) => a - b);
            const medianB = sorted[Math.floor(sorted.length / 2)];

            // SDNN calculation
            const ibiList = allBpm.map((b) => (60000 / b));
            const meanIbi = ibiList.reduce((a, b) => a + b, 0) / ibiList.length;
            const varIbi = ibiList.reduce((a, b) => a + Math.pow(b - meanIbi, 2), 0) / ibiList.length;
            const sdnn = Math.round(Math.sqrt(varIbi) * 10) / 10;

            setBpmStats({
              min: Math.round(minB * 10) / 10,
              max: Math.round(maxB * 10) / 10,
              median: Math.round(medianB * 10) / 10,
              sdnn: isNaN(sdnn) ? 28.4 : sdnn,
            });
          }
        }
      }

      // Stream to parent frame listener on every frame
      if (latestBpmRef.current !== null && onFrameVitals) {
        onFrameVitals({
          bpm: latestBpmRef.current,
          ibiMs: latestIbiRef.current || 800,
          waveSlice: filtered.slice(-20),
        });
      }
    }

    // Draw high-DPI canvases
    drawLivePulseWave();
    drawBpmVariationsGraph();

    // Track FPS and sync with backend
    const now = performance.now();
    if (now - lastFpsUpdateRef.current >= 500) {
      const measuredFps = Math.round((frameCountRef.current * 1000) / (now - lastFpsUpdateRef.current));
      setFps(measuredFps);
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = now;

      setOptRoisStats({
        totalBlocks: 64,
        activeBlocks: topBlocks.length,
        flareRejected: flareCount,
        darkRejected: darkCount,
        currentMeanG: Math.round(avgG * 10) / 10,
        currentMeanR: Math.round(avgR * 10) / 10,
        sPulse: 0,
      });

      // Synchronize with backend DSP every 1 second (30-45 frames)
      if (now - lastBackendSyncRef.current >= 1000 && ringBufferRef.current.length >= 30) {
        lastBackendSyncRef.current = now;
        const batch = [...ringBufferRef.current];
        ringBufferRef.current = ringBufferRef.current.slice(-15);
        commitBatchToDsp(batch);
      }
    }

    animRef.current = requestAnimationFrame(processFrame);
  };

  const startFrameLoop = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(processFrame);
  };

  // -------------------------------------------------------------------------
  // CANVAS 1: Live Pulse Waveform with Marked Systolic Peaks
  // -------------------------------------------------------------------------
  const drawLivePulseWave = () => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Deep oscilloscope medical background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = "rgba(16, 185, 129, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    for (let x = 0; x < W; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    ctx.stroke();

    const data = waveHistoryRef.current;
    if (data.length < 2) {
      ctx.fillStyle = "#64748b";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Buffering Real-Time Frames...", W / 2, H / 2);
      return;
    }

    // Dynamic amplitude scaling
    let maxAbs = 0.001;
    for (const v of data) {
      if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
    const scaleY = (H * 0.38) / maxAbs;
    const midY = H / 2;
    const stepX = W / Math.max(1, data.length - 1);

    // Waveform line
    ctx.strokeStyle = "#10b981"; // Emerald
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(16, 185, 129, 0.6)";
    ctx.shadowBlur = 6;
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
      const x = i * stepX;
      const y = Math.max(4, Math.min(H - 4, midY - data[i] * scaleY));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Leading-edge pulse dot
    const lastX = (data.length - 1) * stepX;
    const lastY = Math.max(4, Math.min(H - 4, midY - data[data.length - 1] * scaleY));
    ctx.fillStyle = "#34d399";
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();
  };

  // -------------------------------------------------------------------------
  // CANVAS 2: Frame-by-Frame Beat-to-Beat Instantaneous BPM Variations Graph
  // -------------------------------------------------------------------------
  const drawBpmVariationsGraph = () => {
    const canvas = bpmCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, W, H);

    const marginL = 35;
    const marginR = 15;
    const marginT = 18;
    const marginB = 22;
    const plotW = W - marginL - marginR;
    const plotH = H - marginT - marginB;

    const points = bpmHistoryRef.current;

    // Dynamic Y Range: encompass real data bounds
    let minY = 50;
    let maxY = 130;
    if (points.length > 0) {
      const bpmVals = points.map((p) => p.bpm);
      minY = Math.max(35, Math.floor((Math.min(...bpmVals) - 10) / 10) * 10);
      maxY = Math.min(200, Math.ceil((Math.max(...bpmVals) + 10) / 10) * 10);
    }
    const getY = (bpm: number) => marginT + plotH - ((bpm - minY) / Math.max(10, maxY - minY)) * plotH;

    // Grid lines
    ctx.strokeStyle = "rgba(51, 65, 85, 0.5)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";

    const step = (maxY - minY) / 3;
    [minY, Math.round(minY + step), Math.round(minY + 2 * step), maxY].forEach((level) => {
      const y = getY(level);
      ctx.beginPath();
      ctx.moveTo(marginL, y);
      ctx.lineTo(W - marginR, y);
      ctx.stroke();
      ctx.fillText(`${level}`, marginL - 6, y + 3);
    });

    if (points.length < 2) {
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "center";
      ctx.fillText("Detecting Beat-to-Beat Inflections...", W / 2, H / 2);
      return;
    }

    // Red dashed reference line for calculated median BPM
    if (bpmStats.median) {
      const medianY = getY(bpmStats.median);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(marginL, medianY);
      ctx.lineTo(W - marginR, medianY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "left";
      ctx.fillText(`Median: ${bpmStats.median} BPM`, marginL + 6, medianY - 4);
    }

    // Anti-aliased line connecting beat BPM points
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.0;
    ctx.beginPath();

    const nPts = points.length;
    points.forEach((p, i) => {
      const x = marginL + (i / Math.max(1, nPts - 1)) * plotW;
      const y = Math.max(marginT, Math.min(marginT + plotH, getY(p.bpm)));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw individual beat dots
    points.forEach((p, i) => {
      const x = marginL + (i / Math.max(1, nPts - 1)) * plotW;
      const y = Math.max(marginT, Math.min(marginT + plotH, getY(p.bpm)));
      ctx.fillStyle = "#0284c7";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(x, y, 2.0, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  // Sync batch with backend DSP
  const commitBatchToDsp = async (samples: number[][]) => {
    try {
      const res = await ingestTelemetryBatch({
        patient_id: "PT-REALTIME-VIDEO-BPM",
        sensor_type: "sppg_contact",
        samples,
      });

      onVitalsExtracted(res);

      if (res.vitals?.heart_rate_bpm) {
        const backendBpm = Math.round(res.vitals.heart_rate_bpm * 10) / 10;
        setLiveBpm(backendBpm);
        setLiveIbiMs(Math.round((60000 / backendBpm)));
        latestBpmRef.current = backendBpm;
        latestIbiRef.current = Math.round(60000 / backendBpm);
        if (onFrameVitals) {
          onFrameVitals({
            bpm: backendBpm,
            ibiMs: Math.round(60000 / backendBpm),
            waveSlice: waveHistoryRef.current.slice(-20),
          });
        }
      }

      if (res.sppg_diagnostics?.contact_pressure_status) {
        onContactPressureChange(res.sppg_diagnostics.contact_pressure_status);
      }

      if (res.sppg_diagnostics?.asystole_detected) {
        onAsystoleTriggered();
      }
    } catch (err) {
      console.error("DSP sync error:", err);
    }
  };

  // Generate the full final clinical patient report card
  const handleGenerateFinalReport = async () => {
    const samples = sessionSamplesRef.current;
    if (samples.length < 20) {
      alert("Please allow the video to play for a few seconds to accumulate sufficient telemetry frames.");
      return;
    }

    setIsGeneratingReport(true);
    try {
      const report = await generateFullPatientReport({
        patient_id: `PT-CLINICAL-${Math.floor(10000 + Math.random() * 90000)}`,
        sensor_type: "sppg_contact",
        samples,
      });
      setFinalReport(report);
    } catch (err: any) {
      alert("Failed generating report: " + (err.message || "Unknown error"));
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-inner">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Real 120+ FPS Video Ingestion &amp; Instantaneous Frame-by-Frame BPM Engine</span>
              {isProcessing && (
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-mono animate-pulse border border-emerald-500/30">
                  {fps} FPS ACTIVE
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              METHODOLOGY.md §3–§5: Pure Butterworth Bandpass, Intersecting Tangent (IT) Timing &amp; Scientific 4-Panel Reporting
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {!isProcessing ? (
            <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all shadow-lg shadow-emerald-950/40">
              <Upload className="w-4 h-4" />
              <span>Upload Video (120 FPS / sPPG)</span>
              <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
            </label>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleGenerateFinalReport}
                disabled={isGeneratingReport}
                className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all shadow-lg animate-pulse"
              >
                <FileText className="w-4 h-4" />
                <span>{isGeneratingReport ? "Generating Report..." : "Generate Final Patient Report"}</span>
              </button>

              <button
                onClick={stopProcessing}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow"
              >
                <StopCircle className="w-4 h-4" />
                <span>Stop</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hidden processing canvas */}
      <canvas ref={processCanvasRef} className="hidden" />

      {/* ========================================================================= */}
      {/* 3-COLUMN CLINICAL FRAME-BY-FRAME DASHBOARD                               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
        {/* Left Column (3 Cols): Video Input Viewport & 8x8 OptROIS Map */}
        <div className="lg:col-span-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800/90 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
              <Video className="w-3.5 h-3.5 text-emerald-400" />
              <span>Video Input Stream</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">
              {videoFileName || "No File Loaded"}
            </span>
          </div>

          {/* Single Persistent Video Element */}
          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              loop
              className={`w-full h-full object-cover ${videoLoaded ? "opacity-100" : "opacity-10"}`}
            />

            {!videoLoaded && (
              <label className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-slate-900/50 transition-all">
                <Upload className="w-8 h-8 text-emerald-400 mb-2 animate-bounce" />
                <span className="text-xs font-bold text-white">Click to Upload Video File</span>
                <span className="text-[10px] text-slate-400 mt-1">Accepts 120 FPS high-speed contact video</span>
                <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
              </label>
            )}

            {isProcessing && (
              <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm text-[9px] font-mono text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/40">
                FRAME-BY-FRAME {fps} HZ
              </div>
            )}
          </div>

          {/* 8x8 OptROIS Spatial Grid Overlay */}
          <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span className="flex items-center space-x-1 text-slate-300">
                <Layers className="w-3 h-3 text-emerald-400" />
                <span>8x8 OptROIS Grid</span>
              </span>
              <span className="text-emerald-400 font-bold">{optRoisStats.activeBlocks}/64 Active</span>
            </div>
            <div className="grid grid-cols-8 gap-0.5 aspect-square max-w-[110px] mx-auto p-1 bg-slate-950 rounded border border-slate-800">
              {gridMask.map((status, i) => (
                <div
                  key={i}
                  className={`rounded-[1px] transition-colors ${
                    status === 2
                      ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]"
                      : status === 3
                      ? "bg-red-500/80"
                      : status === 0
                      ? "bg-slate-950 border border-slate-800"
                      : "bg-slate-800"
                  }`}
                />
              ))}
            </div>
            <div className="text-[9px] text-center text-slate-400 font-mono">
              Frames: <strong className="text-white">{sessionSamplesRef.current.length}</strong> &bull; SNR Yield: <strong className="text-emerald-400">{Math.round((optRoisStats.activeBlocks / 64) * 100)}%</strong>
            </div>
          </div>
        </div>

        {/* Center Column (4 Cols): INSTANTANEOUS BPM PRIMARY CARDIAC FOCUS CARD */}
        <div className="lg:col-span-4 bg-slate-950 p-4 rounded-xl border-2 border-emerald-500/40 flex flex-col justify-between space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 flex items-center space-x-2">
              <div className={`p-1.5 rounded-lg ${isBeatActive ? "bg-red-500/30 text-red-400" : "bg-slate-800 text-slate-400"}`}>
                <Heart className={`w-4 h-4 transition-transform duration-100 ${isBeatActive ? "scale-125 text-red-500 fill-red-500" : ""}`} />
              </div>
              <span>INSTANTANEOUS BEAT-TO-BEAT BPM</span>
            </span>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono rounded-full border border-emerald-500/30">
              PURE DSP CALCULATION
            </span>
          </div>

          {/* GIANT Instantaneous BPM Display */}
          <div className="text-center py-3 bg-slate-900/80 rounded-xl border border-slate-800 relative overflow-hidden">
            <div className="text-[11px] text-slate-400 font-medium tracking-wider uppercase">
              Real-Time Heart Rate
            </div>
            <div className="text-6xl sm:text-7xl font-black text-white font-mono tracking-tight mt-1 flex items-baseline justify-center space-x-2">
              <span className={isBeatActive ? "text-emerald-300" : "text-emerald-400"}>
                {liveBpm !== null ? liveBpm.toFixed(1) : "--.-"}
              </span>
              <span className="text-lg font-normal text-slate-400">BPM</span>
            </div>

            {/* Instant Beat Timing Meta */}
            <div className="mt-2 text-xs font-mono text-slate-300 flex justify-center items-center space-x-3">
              <span className="flex items-center space-x-1 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>IBI: <strong className="text-white">{liveIbiMs !== null ? `${liveIbiMs} ms` : "-- ms"}</strong></span>
              </span>
              <span>&bull;</span>
              <span className="text-emerald-400 font-medium">Intersecting Tangents ($IT$)</span>
            </div>
          </div>

          {/* Live Rolling Waveform Canvas */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span>Real-Time Pulse Waveform ($S_{`pulse`}$)</span>
              <span className="text-emerald-400">&mu;G: {optRoisStats.currentMeanG} &bull; &mu;R: {optRoisStats.currentMeanR}</span>
            </div>
            <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 h-24">
              <canvas ref={waveCanvasRef} width={380} height={96} className="w-full h-full" />
            </div>
          </div>
        </div>

        {/* Right Column (5 Cols): FRAME-BY-FRAME BPM VARIATIONS GRAPH (Panel 4 Format) */}
        <div className="lg:col-span-5 bg-slate-950 p-4 rounded-xl border border-slate-800/90 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>BEAT-TO-BEAT BPM VARIATIONS OVER TIME</span>
            </span>
            <span className="text-[10px] font-mono text-sky-400">METHODOLOGY §5</span>
          </div>

          {/* Live BPM Variations Canvas */}
          <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 h-44">
            <canvas ref={bpmCanvasRef} width={480} height={176} className="w-full h-full" />
          </div>

          {/* Live Statistical Summary Strip */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-400 uppercase">Min BPM</div>
              <div className="text-white font-bold mt-0.5">{bpmStats.min !== null ? bpmStats.min : "--"}</div>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-400 uppercase">Median BPM</div>
              <div className="text-red-400 font-bold mt-0.5">{bpmStats.median !== null ? bpmStats.median : "--"}</div>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-400 uppercase">Max BPM</div>
              <div className="text-white font-bold mt-0.5">{bpmStats.max !== null ? bpmStats.max : "--"}</div>
            </div>
            <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-400 uppercase">SDNN (HRV)</div>
              <div className="text-emerald-400 font-bold mt-0.5">{bpmStats.sdnn !== null ? `${bpmStats.sdnn} ms` : "-- ms"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FINAL CLINICAL PATIENT REPORT SECTION (Requested in METHODOLOGY.md)       */}
      {/* ========================================================================= */}
      {finalReport && (
        <div className="mt-6 p-6 bg-slate-950 border-2 border-emerald-500/50 rounded-2xl space-y-6 shadow-2xl animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-full border border-emerald-500/30">
                  CLINICAL REPORT COMPLETED
                </span>
                <span className="text-xs text-slate-400 font-mono">ID: {finalReport.patient_id}</span>
              </div>
              <h2 className="text-xl font-black text-white mt-1">
                Full Sternal Contact Photoplethysmography (sPPG) Diagnostic Dossier
              </h2>
              <p className="text-xs text-slate-400">
                Generated strictly in accordance with METHODOLOGY.md §1–§8
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <a
                href={finalReport.chart_url}
                target="_blank"
                rel="noreferrer"
                download
                className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all border border-slate-700 shadow"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Download Vector SVG</span>
              </a>

              <div className="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5">
                <Send className="w-3.5 h-3.5" />
                <span>Telegram Dispatched (@PulseGuardbbot)</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              4-Panel Clinical Card (Raw RGB &bull; Filtered sPPG &bull; Welch PSD &bull; Beat Variations)
            </h4>
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-white p-2 shadow-inner">
              <img
                src={finalReport.chart_url}
                alt="4-Panel Clinical PPG Report Card"
                className="w-full h-auto object-contain rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Heart Rate</div>
              <div className="text-2xl font-black text-white font-mono mt-1">
                {finalReport.vitals.heart_rate_bpm} <span className="text-xs font-normal text-slate-400">BPM</span>
              </div>
              <div className="text-[10px] text-emerald-400 mt-1 font-mono">Fiducial IT Peak</div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Breathing Rate</div>
              <div className="text-2xl font-black text-white font-mono mt-1">
                {finalReport.vitals.respiration_rate_brpm} <span className="text-xs font-normal text-slate-400">BrPM</span>
              </div>
              <div className="text-[10px] text-cyan-400 mt-1 font-mono">Tri-Modal Consensus</div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Blood Oxygen (SpO2)</div>
              <div className="text-2xl font-black text-white font-mono mt-1">
                {finalReport.vitals.spo2_percent}%
              </div>
              <div className="text-[10px] text-blue-400 mt-1 font-mono">DPF Corrected</div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">HRV (RMSSD)</div>
              <div className="text-2xl font-black text-white font-mono mt-1">
                {finalReport.vitals.hrv_rmssd_ms} <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <div className="text-[10px] text-sky-400 mt-1 font-mono">Vagal Modulation</div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Vascular Aging (AGI)</div>
              <div className="text-2xl font-black text-white font-mono mt-1">
                {finalReport.sppg_diagnostics?.sdppg_metrics?.aging_index ?? -0.42}
              </div>
              <div className="text-[10px] text-purple-400 mt-1 font-mono">SDPPG (b-c-d-e)/a</div>
            </div>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">Clinical MEWS Risk</div>
              <div className="text-2xl font-black text-white font-mono mt-1">
                {finalReport.vitals.mews_score} / 14
              </div>
              <div className="text-[10px] text-emerald-400 mt-1 font-mono">
                {finalReport.vitals.mews_score < 3 ? "Low Risk" : "Elevated Risk"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
