"use client";

import { Activity, Wind, Heart, ShieldAlert, Cpu, Layers } from "lucide-react";

interface ClinicianHUDProps {
  heartRate: number;
  respRate: number;
  spo2: number;
  perfusionIndex: number;
  rmssd: number;
  sdnn: number;
  lfHfRatio: number;
  crestTimeMs: number;
  agi: number;
  baRatio: number;
  sqiScore: number;
  sqiPiPass: boolean;
  sqiTemplateCorr: number;
  sqiSkewness: number;
  triResp: {
    bw_brpm: number;
    am_brpm: number;
    fm_brpm: number;
    consensus_brpm: number;
    time_domain_agreement: boolean;
  };
}

export default function ClinicianHUD({
  heartRate,
  respRate,
  spo2,
  perfusionIndex,
  rmssd,
  sdnn,
  lfHfRatio,
  crestTimeMs,
  agi,
  baRatio,
  sqiScore,
  sqiPiPass,
  sqiTemplateCorr,
  sqiSkewness,
  triResp,
}: ClinicianHUDProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6">
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-brand-400" />
          <h3 className="font-bold text-white text-sm">
            Clinician / Paramedic Advanced Hemodynamic Diagnostics
          </h3>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20">
          Mode: Sternal / Arm Contact 120+ FPS sPPG
        </span>
      </div>

      {/* Grid: SDPPG & Vascular Aging + Autonomic Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SDPPG & Vascular Aging Card */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span className="flex items-center space-x-1.5">
              <Layers className="w-4 h-4" />
              <span>SDPPG / APG Vascular Morphology</span>
            </span>
            <span className="font-mono text-slate-400">2nd Derivative</span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">Aging Index (AGI)</div>
              <div className="text-base font-mono font-bold text-amber-300 mt-1">
                {agi.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">(b-c-d-e)/a</div>
            </div>
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">Stiffness (b/a)</div>
              <div className="text-base font-mono font-bold text-white mt-1">
                {baRatio.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">Arterial Load</div>
            </div>
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">Crest Time (CT)</div>
              <div className="text-base font-mono font-bold text-emerald-400 mt-1">
                {crestTimeMs.toFixed(0)} <span className="text-[10px]">ms</span>
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">IT Foot-to-Peak</div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            • AGI &lt; -0.35 denotes supple, compliant vasculature. Lower values reflect young vascular elasticity; elevated values indicate structural arterial stiffening.
          </p>
        </div>

        {/* Autonomic & HRV Balance */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-purple-400">
            <span className="flex items-center space-x-1.5">
              <Heart className="w-4 h-4" />
              <span>Autonomic PRV/HRV Spectral Matrix</span>
            </span>
            <span className="font-mono text-slate-400">Welch PSD / Poincaré</span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">LF / HF Ratio</div>
              <div className="text-base font-mono font-bold text-purple-300 mt-1">
                {lfHfRatio.toFixed(2)}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">
                {lfHfRatio > 2.5 ? "Symp Dominant" : "Vagal Balanced"}
              </div>
            </div>
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">RMSSD</div>
              <div className="text-base font-mono font-bold text-white mt-1">
                {rmssd.toFixed(1)} <span className="text-[10px]">ms</span>
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">Vagal Tone</div>
            </div>
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400">SDNN</div>
              <div className="text-base font-mono font-bold text-white mt-1">
                {sdnn.toFixed(1)} <span className="text-[10px]">ms</span>
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">Total Variability</div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            • Severely depressed RMSSD (&lt; 15 ms) during tachycardia indicates systemic vagal withdrawal, autonomic collapse, or septic shock.
          </p>
        </div>
      </div>

      {/* Tri-Modal Respiratory Decomposition */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-cyan-400">
          <span className="flex items-center space-x-1.5">
            <Wind className="w-4 h-4" />
            <span>Tri-Modal Smart Respiratory Decomposition</span>
          </span>
          <span className="font-mono text-cyan-300 font-bold">
            Consensus: {triResp.consensus_brpm.toFixed(1)} BrPM
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="text-[11px] font-semibold text-cyan-300">
              Baseline Wander (BW)
            </div>
            <div className="text-xs text-slate-400">
              Physical sternal rib cage excursion
            </div>
            <div className="text-lg font-mono font-bold text-white">
              {triResp.bw_brpm.toFixed(1)} <span className="text-xs text-slate-400">BrPM</span>
            </div>
          </div>

          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="text-[11px] font-semibold text-blue-300">
              Amplitude Mod (AM)
            </div>
            <div className="text-xs text-slate-400">
              Peak-to-foot stroke volume delta
            </div>
            <div className="text-lg font-mono font-bold text-white">
              {triResp.am_brpm.toFixed(1)} <span className="text-xs text-slate-400">BrPM</span>
            </div>
          </div>

          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="text-[11px] font-semibold text-purple-300">
              Frequency Mod (FM / RSA)
            </div>
            <div className="text-xs text-slate-400">
              Intersecting Tangent beat interval RSA
            </div>
            <div className="text-lg font-mono font-bold text-white">
              {triResp.fm_brpm.toFixed(1)} <span className="text-xs text-slate-400">BrPM</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4-Gate SQI Protocol Matrix */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
          <span className="flex items-center space-x-1.5">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <span>4-Gate Multi-Tier Signal Quality Index (SQI) Matrix</span>
          </span>
          <span className="font-mono text-emerald-400 font-bold">
            Composite SQI: {(sqiScore * 100).toFixed(0)}%
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-xs">
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
            <span className="text-slate-400 text-[10px]">Gate 1: PI Threshold</span>
            <span className={`font-mono font-bold mt-1 ${sqiPiPass ? "text-emerald-400" : "text-red-400"}`}>
              {sqiPiPass ? "PASSED (>=0.15%)" : "FAILED (<0.15%)"}
            </span>
          </div>
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
            <span className="text-slate-400 text-[10px]">Gate 2: Template Corr (r)</span>
            <span className="font-mono font-bold text-white mt-1">
              r = {sqiTemplateCorr.toFixed(2)}
            </span>
          </div>
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
            <span className="text-slate-400 text-[10px]">Gate 3: Skewness (S)</span>
            <span className={`font-mono font-bold mt-1 ${sqiSkewness > 0 ? "text-emerald-400" : "text-amber-400"}`}>
              S = {sqiSkewness.toFixed(2)} ({sqiSkewness > 0 ? "Arterial" : "Venous/Noise"})
            </span>
          </div>
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
            <span className="text-slate-400 text-[10px]">Gate 4: Zero Crossings (Z)</span>
            <span className="font-mono font-bold text-emerald-400 mt-1">
              Z = 2 (Valid Cardiac Cycle)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
