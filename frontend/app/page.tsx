import Link from "next/link";
import { Radio, Send, ArrowRight, ShieldCheck, HeartPulse, Activity, Zap, AlertTriangle, Stethoscope } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-8 py-4">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-850 p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center space-x-2 bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span>Critical 4–8 Minute First-Response Window</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            The Intermediator: Emergency Collapse Triage &amp; Sternal Hemodynamic Monitor
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            When a human collapses from sudden cardiac arrest, asphyxiation, or severe shock, brain damage begins in 4 minutes while EMS takes 8–14 minutes to arrive. The Intermediator turns any smartphone into an ad-hoc 120+ FPS sternal contact sPPG monitor, providing instant asystole detection, an emergency 110 BPM CPR metronome, and live paramedic telemetry relay.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/monitor"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all shadow flex items-center space-x-2"
            >
              <Radio className="w-4 h-4" />
              <span>Launch Sternal sPPG &amp; CPR Monitor</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/paramedic"
              className="bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 font-medium px-5 py-2.5 rounded-xl text-sm transition-all border border-sky-500/30 flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Paramedic Telegram Incident Relay</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 4 Core Pillars from IDEA.md */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Pillar A */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="space-y-3">
            <div className="bg-emerald-500/10 text-emerald-400 p-2.5 rounded-xl border border-emerald-500/20 w-fit">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="font-bold text-white text-base">Pillar A: Instant Sternal Triage</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Press phone camera &amp; flash directly against sternum. 8x8 OptROIS dynamic SNR masking and Transmural Pressure Gauge guide optimal coupling in &lt;5 seconds.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-emerald-400 font-mono">
            METHODOLOGY.md §3 &amp; §4
          </div>
        </div>

        {/* Pillar B */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="space-y-3">
            <div className="bg-red-500/10 text-red-400 p-2.5 rounded-xl border border-red-500/20 w-fit">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="font-bold text-white text-base">Pillar B: 110 BPM CPR Metronome</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Detects pulselessness and flatline instantly. Triggers high-contrast emergency screen, Web Audio 110 BPM acoustic cadence, and 30:2 breath guidance.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-red-400 font-mono">
            IDEA.md §3 Pillar B
          </div>
        </div>

        {/* Pillar C */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="space-y-3">
            <div className="bg-sky-500/10 text-sky-400 p-2.5 rounded-xl border border-sky-500/20 w-fit">
              <Send className="w-5 h-5 text-sky-400" />
            </div>
            <h3 className="font-bold text-white text-base">Pillar C: Paramedic Relay</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Streams vitals to en-route paramedics via @PulseGuardbbot. Critical threshold breaches push 6-panel vector SVG clinical diagnostic cards in &lt;500ms.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-sky-400 font-mono">
            IDEA.md §3 Pillar C
          </div>
        </div>

        {/* Pillar D */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="space-y-3">
            <div className="bg-purple-500/10 text-purple-400 p-2.5 rounded-xl border border-purple-500/20 w-fit">
              <Stethoscope className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="font-bold text-white text-base">Pillar D: Progressive Disclosure</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Simple traffic-light cards for layperson bystanders. 1-tap toggle unlocks clinician HUD with 120 FPS canvas, SDPPG Aging Index, and tri-modal respiration.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-purple-400 font-mono">
            IDEA.md §3 Pillar D
          </div>
        </div>
      </div>

      {/* DSP Pipeline Architecture Banner */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>Full-Stack DSP Engine Architecture (METHODOLOGY.md)</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <div className="text-xs font-bold text-emerald-400 font-mono">8x8 OptROIS</div>
            <div className="text-[11px] text-slate-400 mt-1">Spatial Grid SNR Masking</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <div className="text-xs font-bold text-emerald-400 font-mono">GRD Filter</div>
            <div className="text-[11px] text-slate-400 mt-1">Green-Red Motion Cancelling</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <div className="text-xs font-bold text-emerald-400 font-mono">IT Timing</div>
            <div className="text-[11px] text-slate-400 mt-1">RMSE &le; 5.7ms Systolic Foot</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <div className="text-xs font-bold text-emerald-400 font-mono">4-Gate SQI</div>
            <div className="text-[11px] text-slate-400 mt-1">PI, Template r, Skew, Zero-X</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <div className="text-xs font-bold text-emerald-400 font-mono">SDPPG (a-e)</div>
            <div className="text-[11px] text-slate-400 mt-1">Aging Index &amp; b/a Stiffness</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <div className="text-xs font-bold text-emerald-400 font-mono">Tri-Modal Resp</div>
            <div className="text-[11px] text-slate-400 mt-1">BW + AM + FM Fusion</div>
          </div>
        </div>
      </div>
    </div>
  );
}
