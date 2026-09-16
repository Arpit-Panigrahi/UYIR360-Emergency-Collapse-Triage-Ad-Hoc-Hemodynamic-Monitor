"use client";

import { ShieldCheck, AlertCircle, AlertTriangle } from "lucide-react";

interface PressureGaugeProps {
  status: "UNDER_PRESSURE" | "OPTIMAL" | "OVER_PRESSURE_BLANCHING";
  perfusionIndex: number;
}

export default function PressureGauge({ status, perfusionIndex }: PressureGaugeProps) {
  const isOptimal = status === "OPTIMAL";
  const isUnder = status === "UNDER_PRESSURE";
  const isBlanching = status === "OVER_PRESSURE_BLANCHING";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
          {isOptimal ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          ) : isUnder ? (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          )}
          <span>Sternal Contact Pressure Gauge</span>
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          PI: <strong className="text-white font-bold">{perfusionIndex.toFixed(2)}%</strong>
        </span>
      </div>

      {/* Tri-Zone Gauge Bar */}
      <div className="grid grid-cols-3 gap-1 h-2 rounded-full overflow-hidden bg-slate-950 border border-slate-800">
        <div
          className={`h-full transition-colors ${
            isUnder ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "bg-amber-900/30"
          }`}
          title="Under-pressure (Air gap)"
        />
        <div
          className={`h-full transition-colors ${
            isOptimal ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-emerald-950/40"
          }`}
          title="Optimal Coupling (P_transmural -> 0)"
        />
        <div
          className={`h-full transition-colors ${
            isBlanching ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" : "bg-red-950/30"
          }`}
          title="Over-pressure (Capillary Blanching)"
        />
      </div>

      {/* Dynamic Action Prompt */}
      <div className="text-[11px] font-medium flex items-center justify-between">
        {isOptimal && (
          <span className="text-emerald-400">
            ✓ Optimal transmural pressure coupling. Signals stabilized.
          </span>
        )}
        {isUnder && (
          <span className="text-amber-400 animate-pulse">
            ⚠️ Press phone slightly firmer against sternum/skin.
          </span>
        )}
        {isBlanching && (
          <span className="text-red-400 font-bold animate-pulse">
            🚨 Pressing too hard! Capillaries blanched — loosen contact slightly.
          </span>
        )}
        <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">
          {status.replace(/_/g, " ")}
        </span>
      </div>
    </div>
  );
}
