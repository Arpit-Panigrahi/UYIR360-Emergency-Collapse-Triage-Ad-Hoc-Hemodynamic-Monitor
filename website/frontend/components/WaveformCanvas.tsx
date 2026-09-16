"use client";

import { useEffect, useRef } from "react";

interface WaveformCanvasProps {
  isStreaming: boolean;
  heartRate?: number;
  bpm?: number;
  anomalyDetected?: boolean;
  liveWaveData?: number[];
}

export default function WaveformCanvas({
  isStreaming,
  heartRate: propHeartRate,
  bpm,
  anomalyDetected = false,
  liveWaveData,
}: WaveformCanvasProps) {
  const heartRate = propHeartRate ?? bpm ?? 75;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveBufferRef = useRef<number[]>(new Array(220).fill(0));
  const phaseRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let streamInterval: NodeJS.Timeout | null = null;

    if (isStreaming) {
      streamInterval = setInterval(() => {
        // Asystole / Pulselessness: flatline with slight baseline noise
        if (heartRate <= 0.5) {
          waveBufferRef.current.shift();
          waveBufferRef.current.push((Math.random() - 0.5) * 0.04);
          return;
        }

        // If live wave data is streamed from OptROIS video ingest, use it
        if (liveWaveData && liveWaveData.length > 0) {
          const latestSample = liveWaveData[liveWaveData.length - 1];
          waveBufferRef.current.shift();
          waveBufferRef.current.push(latestSample * 8.0);
          return;
        }

        // Active pulse waveform loop
        phaseRef.current += (heartRate / 60.0) * ((2 * Math.PI) / 30.0);
        const val = Math.sin(phaseRef.current) + 0.38 * Math.sin(phaseRef.current * 2.0);
        waveBufferRef.current.shift();
        waveBufferRef.current.push(val);
      }, 1000 / 30);
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;

      const isAsystole = heartRate <= 0.5;
      const isTachy = heartRate > 125;

      ctx.strokeStyle = isAsystole || anomalyDetected || isTachy ? "#ef4444" : "#10b981";
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      const buf = waveBufferRef.current;
      const step = w / (buf.length - 1);
      for (let i = 0; i < buf.length; i++) {
        const x = i * step;
        const y = mid - buf[i] * (h * 0.35);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw leading pulse sweep dot
      const lastX = w;
      const lastY = mid - buf[buf.length - 1] * (h * 0.35);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(lastX - 2, lastY, 4.5, 0, 2 * Math.PI);
      ctx.fill();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      if (streamInterval) clearInterval(streamInterval);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isStreaming, heartRate, anomalyDetected, liveWaveData]);

  return (
    <div className="relative w-full h-64 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 grid-canvas-bg shadow-inner">
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute bottom-3 left-4 text-[11px] font-mono text-slate-500 flex items-center space-x-3">
        <span>Sweep: 6.0s Window</span>
        <span>•</span>
        <span>Butterworth Bandpass 0.75-3.5 Hz</span>
        <span>•</span>
        <span>{heartRate <= 0.5 ? "⚠️ ASYSTOLE FLATLINE" : heartRate > 125 ? "⚠️ TACHYCARDIA" : "PULSATILE NORMAL"}</span>
      </div>
    </div>
  );
}
