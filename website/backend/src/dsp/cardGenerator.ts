import fs from "fs";
import path from "path";
import type { PPGAnalysisResult } from "./processor.ts";

/**
 * Generates the clinical scientific multi-panel report matching
 * the reference format in storage/photos/PT-88392-TS_1789454269696.jpg:
 *
 * 1. Raw Color Intensity over Time (Skin ROI) - Red, Green, Blue channels
 * 2. Photoplethysmography (PPG) Pulse Waveform | Est. Heart Rate: X BPM
 * 3. Frequency Spectrum & Heart Rate Peak (PSD Welch with Dominant Peak dashed line)
 * 4. Heart Rate Variations | HRV (SDNN): Y ms (Instantaneous BPM + Median dotted line)
 */
export function generateClinicalSvgCard(
  patientId: string,
  analysis: PPGAnalysisResult,
  outputPath: string,
  fs_hz: number = 30.0
): string {
  const width = 1200;
  const height = 960;
  const plotX = 120;
  const plotW = 980;
  const plotH = 140;

  // -------------------------------------------------------------------------
  // SUBPLOT 1: Raw Color Intensity over Time (Skin ROI)
  // -------------------------------------------------------------------------
  const p1Y = 55;
  const durationSec = Math.max(1, (analysis.filtered_bvp?.length || 1) / fs_hz);

  const rawR = analysis.raw_red || [];
  const rawG = analysis.raw_green || [];
  const rawB = analysis.raw_blue || [];
  const nRaw = Math.max(rawR.length, rawG.length, rawB.length, 1);

  // Y-Scale for Raw: 0 to 220
  const p1MinY = 0;
  const p1MaxY = 230;
  const p1YRange = p1MaxY - p1MinY;

  const getP1Y = (val: number) => p1Y + plotH - ((val - p1MinY) / p1YRange) * plotH;
  const getP1X = (idx: number) => plotX + (idx / Math.max(1, nRaw - 1)) * plotW;

  let rLine = "";
  let gLine = "";
  let bLine = "";

  const stepRaw = Math.max(1, Math.floor(nRaw / 300));
  for (let i = 0; i < nRaw; i += stepRaw) {
    const x = getP1X(i).toFixed(1);
    const rVal = rawR[i] ?? 205.0;
    const gVal = rawG[i] ?? 120.0;
    const bVal = rawB[i] ?? 28.0;
    rLine += `${x},${getP1Y(rVal).toFixed(1)} `;
    gLine += `${x},${getP1Y(gVal).toFixed(1)} `;
    bLine += `${x},${getP1Y(bVal).toFixed(1)} `;
  }

  // -------------------------------------------------------------------------
  // SUBPLOT 2: Filtered PPG Pulse Waveform + Detected Peaks
  // -------------------------------------------------------------------------
  const p2Y = 280;
  const bvp = analysis.filtered_bvp || [];
  const nBvp = bvp.length;

  let minBvp = Infinity, maxBvp = -Infinity;
  for (let i = 0; i < nBvp; i++) {
    if (bvp[i] < minBvp) minBvp = bvp[i];
    if (bvp[i] > maxBvp) maxBvp = bvp[i];
  }
  if (!isFinite(minBvp)) minBvp = -3.0;
  if (!isFinite(maxBvp)) maxBvp = 3.0;
  const bvpRange = Math.max(0.2, maxBvp - minBvp);
  const p2MinY = minBvp - bvpRange * 0.1;
  const p2MaxY = maxBvp + bvpRange * 0.1;
  const p2Range = p2MaxY - p2MinY;

  const getP2Y = (val: number) => p2Y + plotH - ((val - p2MinY) / p2Range) * plotH;
  const getP2X = (idx: number) => plotX + (idx / Math.max(1, nBvp - 1)) * plotW;

  let p2Line = "";
  const stepBvp = Math.max(1, Math.floor(nBvp / 400));
  for (let i = 0; i < nBvp; i += stepBvp) {
    p2Line += `${getP2X(i).toFixed(1)},${getP2Y(bvp[i]).toFixed(1)} `;
  }

  // Peak dots
  let p2Peaks = "";
  const peaks = analysis.peaks || [];
  for (const p of peaks) {
    if (p < nBvp) {
      p2Peaks += `<circle cx="${getP2X(p).toFixed(1)}" cy="${getP2Y(bvp[p]).toFixed(1)}" r="4" fill="#e11d48" stroke="#ffffff" stroke-width="1.2"/>`;
    }
  }

  // -------------------------------------------------------------------------
  // SUBPLOT 3: Frequency Spectrum & Heart Rate Peak (PSD Welch)
  // -------------------------------------------------------------------------
  const p3Y = 505;
  const freqs = analysis.welch_freqs || [];
  const psd = analysis.welch_psd || [];

  const minBpmAxis = 40.0;
  const maxBpmAxis = 225.0;
  const bpmRange = maxBpmAxis - minBpmAxis;

  let maxPsd = 0;
  for (let i = 0; i < freqs.length; i++) {
    const bpm = freqs[i] * 60.0;
    if (bpm >= minBpmAxis && bpm <= maxBpmAxis) {
      if (psd[i] > maxPsd) maxPsd = psd[i];
    }
  }
  if (maxPsd <= 0) maxPsd = 1.0;
  const p3MaxY = maxPsd * 1.15;

  const getP3X = (bpm: number) => plotX + ((bpm - minBpmAxis) / bpmRange) * plotW;
  const getP3Y = (power: number) => p3Y + plotH - (power / p3MaxY) * plotH;

  let p3Line = "";
  for (let i = 0; i < freqs.length; i++) {
    const bpm = freqs[i] * 60.0;
    if (bpm >= minBpmAxis && bpm <= maxBpmAxis) {
      p3Line += `${getP3X(bpm).toFixed(1)},${getP3Y(psd[i]).toFixed(1)} `;
    }
  }

  // Peak dashed line
  const peakBpm = analysis.dominant_bpm;
  const peakX = getP3X(peakBpm);
  const peakY = getP3Y(maxPsd);

  // -------------------------------------------------------------------------
  // SUBPLOT 4: Heart Rate Variations | HRV (SDNN)
  // -------------------------------------------------------------------------
  const p4Y = 730;
  const ibis = analysis.ibi_series || [];

  // Instantaneous BPM from beat-to-beat IBIs
  const instantBpm: { timeSec: number; bpm: number }[] = [];
  let accumTime = 0;
  for (let i = 0; i < ibis.length; i++) {
    accumTime += ibis[i] / 1000.0;
    const bpm = Math.max(40, Math.min(220, 60000.0 / ibis[i]));
    instantBpm.push({ timeSec: accumTime, bpm });
  }

  const p4MaxTime = Math.max(durationSec, accumTime, 10);
  const p4MinBpm = 60.0;
  const p4MaxBpm = 210.0;
  const p4BpmRange = p4MaxBpm - p4MinBpm;

  const getP4X = (t: number) => plotX + (t / p4MaxTime) * plotW;
  const getP4Y = (bpm: number) => p4Y + plotH - ((bpm - p4MinBpm) / p4BpmRange) * plotH;

  let p4Line = "";
  let p4Dots = "";
  for (let i = 0; i < instantBpm.length; i++) {
    const x = getP4X(instantBpm[i].timeSec);
    const y = getP4Y(instantBpm[i].bpm);
    p4Line += `${x.toFixed(1)},${y.toFixed(1)} `;
    p4Dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#e11d48"/>`;
  }

  const medianY = getP4Y(analysis.median_bpm || analysis.dominant_bpm);

  // -------------------------------------------------------------------------
  // RENDER SVG DOCUMENT
  // -------------------------------------------------------------------------
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">

  <!-- ========================================================================= -->
  <!-- SUBPLOT 1: Raw Color Intensity over Time (Skin ROI)                       -->
  <!-- ========================================================================= -->
  <!-- Title -->
  <text x="${plotX + plotW / 2}" y="42" font-size="14" font-weight="bold" text-anchor="middle" fill="#000000">
    1. Raw Color Intensity over Time (Skin ROI)
  </text>
  <!-- Box -->
  <rect x="${plotX}" y="${p1Y}" width="${plotW}" height="${plotH}" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <!-- Grid Lines -->
  <line x1="${plotX}" y1="${getP1Y(50)}" x2="${plotX + plotW}" y2="${getP1Y(50)}" stroke="#f1f5f9" stroke-width="1"/>
  <line x1="${plotX}" y1="${getP1Y(100)}" x2="${plotX + plotW}" y2="${getP1Y(100)}" stroke="#f1f5f9" stroke-width="1"/>
  <line x1="${plotX}" y1="${getP1Y(150)}" x2="${plotX + plotW}" y2="${getP1Y(150)}" stroke="#f1f5f9" stroke-width="1"/>
  <line x1="${plotX}" y1="${getP1Y(200)}" x2="${plotX + plotW}" y2="${getP1Y(200)}" stroke="#f1f5f9" stroke-width="1"/>
  <!-- Y Ticks -->
  <line x1="${plotX - 6}" y1="${getP1Y(50)}" x2="${plotX}" y2="${getP1Y(50)}" stroke="#000000" stroke-width="1.2"/>
  <text x="${plotX - 10}" y="${getP1Y(50) + 4}" font-size="11" text-anchor="end" fill="#000000">50</text>
  <line x1="${plotX - 6}" y1="${getP1Y(100)}" x2="${plotX}" y2="${getP1Y(100)}" stroke="#000000" stroke-width="1.2"/>
  <text x="${plotX - 10}" y="${getP1Y(100) + 4}" font-size="11" text-anchor="end" fill="#000000">100</text>
  <line x1="${plotX - 6}" y1="${getP1Y(150)}" x2="${plotX}" y2="${getP1Y(150)}" stroke="#000000" stroke-width="1.2"/>
  <text x="${plotX - 10}" y="${getP1Y(150) + 4}" font-size="11" text-anchor="end" fill="#000000">150</text>
  <line x1="${plotX - 6}" y1="${getP1Y(200)}" x2="${plotX}" y2="${getP1Y(200)}" stroke="#000000" stroke-width="1.2"/>
  <text x="${plotX - 10}" y="${getP1Y(200) + 4}" font-size="11" text-anchor="end" fill="#000000">200</text>
  <!-- Y Label -->
  <text x="65" y="${p1Y + plotH / 2}" font-size="12" text-anchor="middle" fill="#000000" transform="rotate(-90 65 ${p1Y + plotH / 2})">
    Mean Intensity
  </text>
  <!-- X Ticks -->
  ${[0, 5, 10, 15, 20, 25, 30].map((s) => {
    const frac = s / 30.0;
    const x = plotX + frac * plotW;
    return `
      <line x1="${x}" y1="${p1Y}" x2="${x}" y2="${p1Y + plotH}" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="${x}" y1="${p1Y + plotH}" x2="${x}" y2="${p1Y + plotH + 6}" stroke="#000000" stroke-width="1.2"/>
      <text x="${x}" y="${p1Y + plotH + 18}" font-size="11" text-anchor="middle" fill="#000000">${s}</text>
    `;
  }).join("")}
  <!-- X Label -->
  <text x="${plotX + plotW / 2}" y="${p1Y + plotH + 34}" font-size="12" text-anchor="middle" fill="#000000">
    Time (seconds)
  </text>
  <!-- Traces -->
  <polyline fill="none" stroke="#e11d48" stroke-width="1.6" points="${rLine}" />
  <polyline fill="none" stroke="#16a34a" stroke-width="1.6" points="${gLine}" />
  <polyline fill="none" stroke="#2563eb" stroke-width="1.6" points="${bLine}" />
  <!-- Legend -->
  <g transform="translate(${plotX + plotW - 220}, ${p1Y + 12})">
    <line x1="0" y1="6" x2="25" y2="6" stroke="#e11d48" stroke-width="2"/>
    <text x="32" y="10" font-size="11" fill="#000000">Red Channel</text>
    <line x1="0" y1="24" x2="25" y2="24" stroke="#16a34a" stroke-width="2"/>
    <text x="32" y="28" font-size="11" fill="#000000">Green Channel (PPG primary)</text>
    <line x1="0" y1="42" x2="25" y2="42" stroke="#2563eb" stroke-width="2"/>
    <text x="32" y="46" font-size="11" fill="#000000">Blue Channel</text>
  </g>

  <!-- ========================================================================= -->
  <!-- SUBPLOT 2: Photoplethysmography (PPG) Pulse Waveform                      -->
  <!-- ========================================================================= -->
  <!-- Title -->
  <text x="${plotX + plotW / 2}" y="${p2Y - 14}" font-size="14" font-weight="bold" text-anchor="middle" fill="#000000">
    2. Photoplethysmography (PPG) Pulse Waveform | Est. Heart Rate: ${analysis.dominant_bpm.toFixed(1)} BPM
  </text>
  <!-- Box -->
  <rect x="${plotX}" y="${p2Y}" width="${plotW}" height="${plotH}" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <!-- Y Ticks -->
  ${[-4, -2, 0, 2, 4].map((v) => {
    const y = getP2Y(v);
    if (y < p2Y || y > p2Y + plotH) return "";
    return `
      <line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="${plotX - 6}" y1="${y}" x2="${plotX}" y2="${y}" stroke="#000000" stroke-width="1.2"/>
      <text x="${plotX - 10}" y="${y + 4}" font-size="11" text-anchor="end" fill="#000000">${v}</text>
    `;
  }).join("")}
  <!-- Y Label -->
  <text x="65" y="${p2Y + plotH / 2}" font-size="12" text-anchor="middle" fill="#000000" transform="rotate(-90 65 ${p2Y + plotH / 2})">
    Normalized Amplitude
  </text>
  <!-- X Ticks -->
  ${[0, 10, 20, 30, 40, 50, 60].map((s) => {
    const x = plotX + (s / 60.0) * plotW;
    return `
      <line x1="${x}" y1="${p2Y}" x2="${x}" y2="${p2Y + plotH}" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="${x}" y1="${p2Y + plotH}" x2="${x}" y2="${p2Y + plotH + 6}" stroke="#000000" stroke-width="1.2"/>
      <text x="${x}" y="${p2Y + plotH + 18}" font-size="11" text-anchor="middle" fill="#000000">${s}</text>
    `;
  }).join("")}
  <!-- X Label -->
  <text x="${plotX + plotW / 2}" y="${p2Y + plotH + 34}" font-size="12" text-anchor="middle" fill="#000000">
    Time (seconds)
  </text>
  <!-- Traces -->
  <polyline fill="none" stroke="#0284c7" stroke-width="1.8" points="${p2Line}" />
  ${p2Peaks}
  <!-- Legend -->
  <g transform="translate(${plotX + plotW - 275}, ${p2Y + 12})">
    <line x1="0" y1="6" x2="25" y2="6" stroke="#0284c7" stroke-width="2"/>
    <text x="32" y="10" font-size="11" fill="#000000">Filtered rPPG Waveform (0.75 - 3.5 Hz)</text>
    <circle cx="12" cy="24" r="4" fill="#e11d48"/>
    <text x="32" y="28" font-size="11" fill="#000000">Detected Systolic Peaks (N=${peaks.length})</text>
  </g>

  <!-- ========================================================================= -->
  <!-- SUBPLOT 3: Frequency Spectrum & Heart Rate Peak                           -->
  <!-- ========================================================================= -->
  <!-- Title -->
  <text x="${plotX + plotW / 2}" y="${p3Y - 14}" font-size="14" font-weight="bold" text-anchor="middle" fill="#000000">
    3. Frequency Spectrum &amp; Heart Rate Peak
  </text>
  <!-- Box -->
  <rect x="${plotX}" y="${p3Y}" width="${plotW}" height="${plotH}" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <!-- Y Ticks -->
  ${[0.0, 0.2, 0.4, 0.6].map((p) => {
    const y = getP3Y(p);
    return `
      <line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="${plotX - 6}" y1="${y}" x2="${plotX}" y2="${y}" stroke="#000000" stroke-width="1.2"/>
      <text x="${plotX - 10}" y="${y + 4}" font-size="11" text-anchor="end" fill="#000000">${p.toFixed(1)}</text>
    `;
  }).join("")}
  <!-- Y Label -->
  <text x="65" y="${p3Y + plotH / 2}" font-size="12" text-anchor="middle" fill="#000000" transform="rotate(-90 65 ${p3Y + plotH / 2})">
    Power Spectral Density
  </text>
  <!-- X Ticks (BPM) -->
  ${[50, 75, 100, 125, 150, 175, 200, 225].map((bpm) => {
    const x = getP3X(bpm);
    return `
      <line x1="${x}" y1="${p3Y}" x2="${x}" y2="${p3Y + plotH}" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="${x}" y1="${p3Y + plotH}" x2="${x}" y2="${p3Y + plotH + 6}" stroke="#000000" stroke-width="1.2"/>
      <text x="${x}" y="${p3Y + plotH + 18}" font-size="11" text-anchor="middle" fill="#000000">${bpm}</text>
    `;
  }).join("")}
  <!-- X Label -->
  <text x="${plotX + plotW / 2}" y="${p3Y + plotH + 34}" font-size="12" text-anchor="middle" fill="#000000">
    Heart Rate (BPM)
  </text>
  <!-- Traces -->
  <polyline fill="none" stroke="#9333ea" stroke-width="2.2" points="${p3Line}" />
  <line x1="${peakX}" y1="${p3Y + plotH}" x2="${peakX}" y2="${peakY}" stroke="#e11d48" stroke-width="2" stroke-dasharray="5,4"/>
  <!-- Legend -->
  <g transform="translate(${plotX + plotW - 235}, ${p3Y + 12})">
    <line x1="0" y1="6" x2="25" y2="6" stroke="#9333ea" stroke-width="2"/>
    <text x="32" y="10" font-size="11" fill="#000000">PSD (Welch)</text>
    <line x1="0" y1="24" x2="25" y2="24" stroke="#e11d48" stroke-width="2" stroke-dasharray="5,4"/>
    <text x="32" y="28" font-size="11" fill="#000000">Dominant Peak (${analysis.dominant_bpm.toFixed(1)} BPM)</text>
  </g>

  <!-- ========================================================================= -->
  <!-- SUBPLOT 4: Heart Rate Variations | HRV (SDNN)                             -->
  <!-- ========================================================================= -->
  <!-- Title -->
  <text x="${plotX + plotW / 2}" y="${p4Y - 14}" font-size="14" font-weight="bold" text-anchor="middle" fill="#000000">
    4. Heart Rate Variations | HRV (SDNN): ${analysis.sdnn_ms.toFixed(1)} ms
  </text>
  <!-- Box -->
  <rect x="${plotX}" y="${p4Y}" width="${plotW}" height="${plotH}" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>
  <!-- Y Ticks -->
  ${[100, 150, 200].map((bpm) => {
    const y = getP4Y(bpm);
    return `
      <line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="${plotX - 6}" y1="${y}" x2="${plotX}" y2="${y}" stroke="#000000" stroke-width="1.2"/>
      <text x="${plotX - 10}" y="${y + 4}" font-size="11" text-anchor="end" fill="#000000">${bpm}</text>
    `;
  }).join("")}
  <!-- Y Label -->
  <text x="65" y="${p4Y + plotH / 2}" font-size="12" text-anchor="middle" fill="#000000" transform="rotate(-90 65 ${p4Y + plotH / 2})">
    Heart Rate (BPM)
  </text>
  <!-- X Ticks -->
  ${[0, 10, 20, 30, 40, 50].map((s) => {
    const x = plotX + (s / 50.0) * plotW;
    return `
      <line x1="${x}" y1="${p4Y}" x2="${x}" y2="${p4Y + plotH}" stroke="#f1f5f9" stroke-width="1"/>
      <line x1="${x}" y1="${p4Y + plotH}" x2="${x}" y2="${p4Y + plotH + 6}" stroke="#000000" stroke-width="1.2"/>
      <text x="${x}" y="${p4Y + plotH + 18}" font-size="11" text-anchor="middle" fill="#000000">${s}</text>
    `;
  }).join("")}
  <!-- X Label -->
  <text x="${plotX + plotW / 2}" y="${p4Y + plotH + 34}" font-size="12" text-anchor="middle" fill="#000000">
    Time (seconds)
  </text>
  <!-- Traces -->
  <polyline fill="none" stroke="#e11d48" stroke-width="1.8" points="${p4Line}" />
  ${p4Dots}
  <line x1="${plotX}" y1="${medianY}" x2="${plotX + plotW}" y2="${medianY}" stroke="#000000" stroke-width="1.8" stroke-dasharray="2,3"/>
  <!-- Legend -->
  <g transform="translate(${plotX + plotW - 235}, ${p4Y + 12})">
    <line x1="0" y1="6" x2="25" y2="6" stroke="#e11d48" stroke-width="2"/>
    <circle cx="12" cy="6" r="3.5" fill="#e11d48"/>
    <text x="32" y="10" font-size="11" fill="#000000">Instantaneous BPM</text>
    <line x1="0" y1="24" x2="25" y2="24" stroke="#000000" stroke-width="2" stroke-dasharray="2,3"/>
    <text x="32" y="28" font-size="11" fill="#000000">Median BPM (${(analysis.median_bpm || analysis.dominant_bpm).toFixed(1)} BPM)</text>
  </g>
</svg>`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svg, "utf-8");
  return outputPath;
}
