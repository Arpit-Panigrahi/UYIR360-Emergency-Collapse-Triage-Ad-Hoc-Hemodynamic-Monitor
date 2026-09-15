# PulseGuard: Emergency Triage & Continuous Physiological Telemetry

> **100% Full-Stack TypeScript Clinical Tele-Triage & Monitoring Platform**
> Built with **Next.js 15 App Router (TypeScript)** and **Node.js 22 Native TypeScript Backend**.

PulseGuard transforms commodity smartphone sensors (rear camera + flash, front-facing video, microphone, and inertial sensors) into clinical diagnostic instruments, bridging field patients directly with on-duty paramedics via real-time Telegram alerts and a 60 FPS live monitoring dashboard.

---

## 🌟 Core System Flows

1. **Flow 1: Preliminary Photo Triage Intake (`POST /api/v1/triage/intake-photo`)**
   - Ingests field trauma, burn, laceration, or skin pallor/cyanosis photos.
   - Executes automated computer vision analysis in TypeScript (`PreliminaryVisionTriageEngine`) with START and ESI (1–5) severity scoring.
   - Instantly pushes the case with photo attachment to the on-duty paramedic's Telegram chat.

2. **Flow 2: Continuous Telemetry Streaming ("The Decided Layer" - `WSS /api/v1/telemetry/stream/:id`)**
   - Ingests 30 FPS multi-channel rPPG and contact PPG sensor streams over WebSockets.
   - **TypeScript DSP Signal Processing Pipeline (`ClinicalPPGProcessor`):**
     - Plane-Orthogonal-to-Skin (POS) & CHROM blind color separation.
     - 4th-order Butterworth digital IIR filter ($[0.75 - 3.5\text{ Hz}]$ for cardiac, $[0.1 - 0.5\text{ Hz}]$ for respiration).
     - Welch Power Spectral Density (PSD) for dominant BPM extraction.
     - Pan-Tompkins systolic peak detection & Inter-Beat Interval ($IBI$) series.
     - Time-domain HRV: $SDNN$, $RMSSD$ (Vagal Tone), and $pNN50$.
     - Frequency-domain HRV: $LF$ ($0.04-0.15\text{ Hz}$), $HF$ ($0.15-0.40\text{ Hz}$), and $LF/HF$ autonomic sympathetic ratio.
     - Non-linear Poincaré dynamics: $SD1$ and $SD2$.
     - Continuous Respiration Rate ($RR$ in BrPM) via Respiratory-Induced Intensity Variation (RIIV/RSA).
     - Hemodynamics: Perfusion Index (PI), relative $SpO_2$ proxy, and Pulse Crest Time.

3. **Flow 3: Paramedic Telegram Alert & Visual Diagnostic Card Engine**
   - Evaluates National Early Warning Scores (NEWS2 / MEWS) and extreme vital thresholds.
   - When an acute event occurs, a headless rendering worker automatically compiles a **6-Panel Multi-Biomarker Analysis Chart** (matching validated clinical formats).
   - Immediately dispatches the chart and structured HTML card to Paramedic Telegram with interactive action buttons:
     - `[🚑 Dispatch Ambulance]`
     - `[👨‍⚕️ Escalate to Trauma ER]`
     - `[📈 Open Live Telemetry]` (Launches 60 FPS live canvas monitor)

---

## 📂 Project Architecture

```
khunChuse/
├── package.json                 # Root TypeScript scripts & dependencies
├── run_simulation.ts            # Automated end-to-end 3-flow verification test in TypeScript
├── ARCHITECTURE_BLUEPRINT.md    # Master clinical & technical architecture specification
├── .env.example                 # Environment configuration template
│
├── backend/                     # Pure TypeScript Backend Server (Node.js 22 Native)
│   └── src/
│       ├── index.ts             # HTTP + WebSocket Server (REST & 30 FPS stream)
│       ├── config.ts            # Settings & threshold configurations
│       ├── dsp/
│       │   ├── processor.ts     # ClinicalPPGProcessor (POS rPPG, IIR, PSD, Poincaré)
│       │   └── cardGenerator.ts # Automated 6-Panel clinical diagnostic SVG chart renderer
│       └── services/
│           ├── storage.ts       # Photo & chart disk persistence
│           ├── triageCv.ts      # Computer vision photo triage analyzer (START / ESI)
│           ├── telegram.ts      # Paramedic Telegram Bot service (aiogram / Telegram API)
│           └── db.ts            # Persistent JSON/SQLite state store
│
├── frontend/                    # Next.js 15 App Router Frontend (TypeScript & Tailwind)
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── components/
│   │   ├── Navbar.tsx           # Navigation header with live status
│   │   └── WaveformCanvas.tsx   # 60 FPS HTML5 double-buffered canvas waveform
│   ├── lib/
│   │   └── api.ts               # Typed API client for FastAPI/Node endpoints
│   └── app/
│       ├── layout.tsx           # Root layout with dark mode
│       ├── page.tsx             # Main interactive overview
│       ├── triage/page.tsx      # Flow 1: Photo Intake & START/ESI result
│       ├── monitor/page.tsx     # Flow 2: 60Hz Telemetry & Anomaly Trigger
│       └── paramedic/page.tsx   # Flow 3: Incident feed & Telegram audit board
│
└── storage/                     # Storage for raw photos & clinical diagnostic charts
    ├── photos/
    └── charts/
```

---

## 🚀 Quick Start Guide

### 1. Run the End-to-End TypeScript Verification
Execute the test script to verify all 3 flows (Photo Intake $\to$ Continuous DSP $\to$ Telegram Chart):
```bash
npm run test:simulation
```

### 2. Launch the TypeScript Backend
Start the high-performance TypeScript backend server:
```bash
npm run start:backend
```
- **Backend API & WebSockets:** `http://localhost:8000`
- **Telemetry Stream Endpoint:** `ws://localhost:8000/api/v1/telemetry/stream/:patient_id`

### 3. Launch the Next.js App Router Frontend
In a separate terminal, launch the Next.js development server:
```bash
npm run dev:frontend
```
Open your browser to:
- **Web App Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Flow 1 Photo Triage:** [http://localhost:3000/triage](http://localhost:3000/triage)
- **Flow 2 Live 60Hz Telemetry:** [http://localhost:3000/monitor](http://localhost:3000/monitor)
- **Flow 3 Paramedic Incident Board:** [http://localhost:3000/paramedic](http://localhost:3000/paramedic)

### 4. Connect Live Telegram Alerts
Set your bot token in `.env`:
```ini
TELEGRAM_BOT_TOKEN="your_bot_token_from_botfather"
PARAMEDIC_DEFAULT_CHAT_ID="your_telegram_chat_id"
```
Once added, all preliminary triage photos and critical vital alerts will be pushed directly to your Telegram chat.
