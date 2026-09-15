"use client";

import { useEffect, useState } from "react";
import { Send, RefreshCw, Truck, Check, AlertCircle } from "lucide-react";
import { getParamedicEvents, acknowledgeEvent, type ClinicalEventItem } from "@/lib/api";

export default function ParamedicPage() {
  const [events, setEvents] = useState<ClinicalEventItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await getParamedicEvents();
      setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleDispatch = (eventId: string, patientId: string) => {
    setActionStatus((prev) => ({
      ...prev,
      [eventId]: `Ambulance Dispatched to ${patientId} (ETA: 6m)`,
    }));
  };

  const handleAcknowledge = async (eventId: string) => {
    try {
      await acknowledgeEvent(eventId);
      setActionStatus((prev) => ({
        ...prev,
        [eventId]: "Acknowledged by Paramedic",
      }));
      loadEvents();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-850 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Send className="w-5 h-5 text-sky-400" />
            <span>Flow 3: Paramedic Telegram Escalations & Clinical Incident Audit</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time feed of all patient events forwarded to Telegram. View attached trauma photos, auto-generated 6-panel clinical diagnostic charts, and dispatch ambulance units.
          </p>
        </div>
        <button
          onClick={loadEvents}
          disabled={loading}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-700 flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Incident Board</span>
        </button>
      </div>

      {events.length === 0 && !loading ? (
        <div className="bg-slate-900/60 p-12 rounded-2xl border border-slate-800 text-center text-slate-500 space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-slate-600" />
          <p className="text-sm font-medium">No emergency events logged yet.</p>
          <p className="text-xs text-slate-500">
            Submit a preliminary photo in Tab 1 or trigger an anomaly in Tab 2 to generate live Telegram dispatches.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const isCritical = event.severity === "CRITICAL";
            const statusMsg = actionStatus[event.event_id];

            return (
              <div
                key={event.event_id}
                className={`bg-slate-900 p-5 rounded-2xl border shadow-lg space-y-3 transition-colors ${
                  isCritical ? "border-red-500/40" : "border-slate-800"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                        isCritical
                          ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {event.event_type}
                    </span>
                    <span className="font-mono text-sm text-white font-semibold">
                      Patient: {event.patient_id}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {new Date(event.triggered_at).toLocaleTimeString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <div className="text-xs text-slate-300 font-medium">
                      {event.payload?.reason || event.payload?.triage_color
                        ? `Severity: ${event.payload.triage_color || "CRITICAL"} | ESI Level ${event.payload.esi_level || 1}`
                        : "Threshold breach event"}
                    </div>

                    {event.payload?.vitals && (
                      <div className="mt-2 text-xs text-slate-400 space-y-1">
                        <div>
                          • Heart Rate:{" "}
                          <span className="text-white font-mono">{event.payload.vitals.hr} BPM</span>
                        </div>
                        <div>
                          • Respiration:{" "}
                          <span className="text-white font-mono">{event.payload.vitals.rr} BrPM</span>
                        </div>
                        <div>
                          • SpO2:{" "}
                          <span className="text-white font-mono">{event.payload.vitals.spo2}%</span>
                        </div>
                        <div>
                          • MEWS Risk:{" "}
                          <span className="text-red-400 font-mono font-bold">
                            {event.payload.vitals.mews} / 14
                          </span>
                        </div>
                      </div>
                    )}

                    {statusMsg && (
                      <div className="mt-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>{statusMsg}</span>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleDispatch(event.event_id, event.patient_id)}
                        className="bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Dispatch Ambulance</span>
                      </button>
                      <button
                        onClick={() => handleAcknowledge(event.event_id)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium px-3.5 py-1.5 rounded-lg border border-slate-700"
                      >
                        Acknowledge
                      </button>
                    </div>
                  </div>

                  {/* Attached Media */}
                  <div>
                    {event.chart_image_path && (() => {
                      const fname = event.chart_image_path.split("/").pop() || "";
                      const isPhoto = event.event_type === "PHOTO_TRIAGE" || fname.endsWith(".jpg") || fname.endsWith(".jpeg") || fname.endsWith(".png");
                      const mediaUrl = isPhoto ? `/storage/photos/${fname}` : `/storage/charts/${fname}`;
                      return (
                        <div>
                          <p className="text-[11px] text-slate-400 mb-1">
                            {isPhoto ? "Patient Trauma Intake Photo:" : "Attached Clinical Diagnostic Chart (Pushed to Telegram):"}
                          </p>
                          <a href={mediaUrl} target="_blank" rel="noreferrer">
                            <img
                              src={mediaUrl}
                              alt="Diagnostic Media"
                              className="rounded-lg border border-slate-700 max-h-48 object-cover hover:opacity-90 transition-opacity bg-slate-950"
                            />
                          </a>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
