"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, AlertOctagon, Heart, RefreshCw } from "lucide-react";

interface CPRMetronomeProps {
  bpm?: number;
  active: boolean;
  onDismiss?: () => void;
}

export default function CPRMetronome({ bpm = 110, active, onDismiss }: CPRMetronomeProps) {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [compressionsCount, setCompressionsCount] = useState<number>(0);
  const [cyclePhase, setCyclePhase] = useState<"compressions" | "breaths">("compressions");
  const [pulseScale, setPulseScale] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<any>(null);

  const intervalMs = (60 / bpm) * 1000;

  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
      if (audioCtxRef.current) {
        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);

        // High sharp 880Hz beep for CPR beat
        osc.frequency.setValueAtTime(880, audioCtxRef.current.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtxRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.08);

        osc.start();
        osc.stop(audioCtxRef.current.currentTime + 0.08);
      }
    } catch {
      // Audio context policy fallback
    }
  };

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      setCompressionsCount(0);
      return;
    }

    timerRef.current = setInterval(() => {
      setPulseScale((prev) => !prev);
      playBeep();

      setCompressionsCount((prev) => {
        const next = prev + 1;
        if (next >= 30) {
          setCyclePhase("breaths");
          // 4 seconds for 2 breaths
          setTimeout(() => {
            setCyclePhase("compressions");
            setCompressionsCount(0);
          }, 4000);
          return 30;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, soundEnabled, intervalMs]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-between p-6 text-white animate-fade-in">
      {/* Top Header */}
      <div className="w-full max-w-lg flex items-center justify-between border-b border-red-800/60 pb-4">
        <div className="flex items-center space-x-2">
          <AlertOctagon className="w-7 h-7 text-red-400 animate-bounce" />
          <span className="font-black text-xl tracking-wider text-red-200">
            EMERGENCY: PULSELESSNESS DETECTED
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 bg-red-900/80 rounded-lg hover:bg-red-800 transition"
            title="Toggle Audio Beep"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-red-200" /> : <VolumeX className="w-5 h-5 text-red-400" />}
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-xs bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700"
            >
              Dismiss / Re-check
            </button>
          )}
        </div>
      </div>

      {/* Main Beating Target */}
      <div className="flex flex-col items-center justify-center my-auto text-center space-y-6">
        <div
          className={`w-52 h-52 rounded-full border-8 border-red-500 flex flex-col items-center justify-center bg-red-600/30 shadow-2xl transition-transform duration-75 ${
            pulseScale ? "scale-105 shadow-red-500/50" : "scale-95"
          }`}
        >
          <Heart className="w-14 h-14 text-white fill-white mb-2" />
          <span className="text-5xl font-black">{bpm}</span>
          <span className="text-xs uppercase tracking-widest text-red-200 font-bold">BPM Metronome</span>
        </div>

        {/* Compression / Breath State */}
        <div className="space-y-2">
          {cyclePhase === "compressions" ? (
            <div>
              <div className="text-3xl font-black tracking-tight text-white">
                COMPRESSION {compressionsCount} / 30
              </div>
              <p className="text-sm font-semibold text-red-300 mt-1">
                PUSH HARD & FAST IN CENTER OF CHEST (5–6 cm depth)
              </p>
            </div>
          ) : (
            <div className="bg-amber-500/20 border border-amber-500/40 p-4 rounded-xl">
              <div className="text-2xl font-black text-amber-300">
                GIVE 2 RESCUE BREATHS NOW
              </div>
              <p className="text-xs text-amber-200 mt-1">
                Tilt head, lift chin, pinch nose, 1 second per breath
              </p>
            </div>
          )}
        </div>

        {/* Compression Progress Bar */}
        <div className="w-72 bg-red-900/60 rounded-full h-3 overflow-hidden border border-red-700/50">
          <div
            className="bg-red-400 h-full transition-all duration-100"
            style={{ width: `${(compressionsCount / 30) * 100}%` }}
          />
        </div>
      </div>

      {/* Actionable First-Aid Directions */}
      <div className="w-full max-w-lg bg-red-900/40 border border-red-800/80 rounded-xl p-4 text-xs space-y-2">
        <div className="font-bold text-red-200 flex items-center space-x-2">
          <span>PARAMEDIC RELAY DISPATCHED:</span>
          <span className="font-mono text-emerald-400">AMBULANCE NOTIFIED</span>
        </div>
        <p className="text-red-300">
          1. Keep phone on sternum or beside patient. 2. Do not stop compressions until EMS arrives or AED prompts.
        </p>
      </div>
    </div>
  );
}
