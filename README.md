# UYIR360: Emergency Collapse Triage & Ad-Hoc Hemodynamic Monitor

> **Open-Source Industrial-Grade Edge-to-Cloud Tele-Triage & Continuous Physiological Telemetry Platform**
> Bridging commodity mobile sensor arrays with on-duty paramedics and emergency clinicians via high-speed edge signal processing, real-time WebSocket streaming, and automated multi-biomarker diagnostic cards.

---

## 📋 Overview

UYIR360 transforms standard consumer smartphones into clinical-grade diagnostic instruments in acute collapse and emergency trauma situations. By leveraging multi-spectral photoplethysmography (contact sPPG and remote rPPG), high-speed camera sampling (up to 120+ FPS), device inertial sensors, and real-time computer vision, UYIR360 extracts vital hemodynamics without dedicated hardware:

- **Heart Rate & Pulse Rate Variability (HRV / PRV)**: Time-domain ($SDNN$, $RMSSD$, $pNN50$), frequency-domain ($LF$, $HF$, $LF/HF$), and non-linear Poincaré geometry ($SD1/SD2$).
- **Respiratory Metrics**: Respiration Rate ($RR$ in BrPM) via Respiratory-Induced Intensity Variation (RIIV) and Respiratory Sinus Arrhythmia (RSA).
- **Perfusion & Oxygenation**: Contact Perfusion Index ($PI$), relative $SpO_2$ proxies, and Second Derivative PPG ($SDPPG$) arterial stiffness markers ($b/a$, $c/a$, $d/a$, $e/a$).
- **Contact Pressure Intelligence**: Motion-sensor and contact-area pressure feedback to prevent capillary occlusion artifacts.
- **Automated Clinical Triage & Alerts**: START / ESI (1–5) severity stratification, instant Telegram emergency push notifications, and auto-generated 6-panel diagnostic SVG clinical report cards.

---

## 🏛️ Monorepo Architecture

The repository is organized into a modular monorepo containing the edge mobile client, the central telemetry web platform, and shared clinical methodology specifications:

```
UYIR360-Emergency-Collapse-Triage-Ad-Hoc-Hemodynamic-Monitor/
├── README.md                            # Primary documentation & setup guide
├── METHODOLOGY.md                       # Comprehensive clinical & mathematical DSP specification
├── ARCHITECTURE_BLUEPRINT.md            # Edge-to-cloud technical blueprint & data schemas
├── IDEA.md                              # Core clinical problem statement & innovation overview
├── mobile-sensor-health-markers-research.md # Clinical validation literature & benchmarks
│
├── mobile/                              # Mobile Edge Client (Expo / React Native & Android Native)
│   ├── app/                             # Expo Router application screens & navigation
│   ├── android/                         # Android native module & Camera2 120 FPS high-speed bridge
│   │   ├── app/src/main/java/.../highspeed/ # Camera2, SciPy bridge, & offline video processors
│   │   └── build.gradle                 # Native build & NDK configurations
│   ├── components/                      # HUD UI, vital measurement screens, & Skia canvases
│   ├── src/
│   │   ├── processing/                  # On-device TypeScript DSP algorithms
│   │   │   ├── cardio/                  # Fiducial peak detection & PRV analysis
│   │   │   ├── dsp/                     # Butterworth digital IIR filtering & PCHIP resamplers
│   │   │   ├── hemodynamics/            # Oximetry proxies & Perfusion Index
│   │   │   ├── morphology/              # SDPPG ($a, b, c, d, e$ wave) morphology extraction
│   │   │   ├── pipeline/                # Full-pipeline orchestrator
│   │   │   ├── pressure/                # Contact pressure compliance gauge
│   │   │   ├── respiration/             # RIIV / RSA respiratory extraction
│   │   │   ├── spatial/                 # POS / CHROM & OptROIS spatial color separation
│   │   │   └── triage/                  # Rapid START & ESI triage scoring engine
│   │   └── services/                    # Edge Telegram alerting & remote sync
│   └── package.json                     # Mobile runtime dependencies & scripts
│
└── website/                             # Central Telemetry Web Platform & Tele-Triage Server
    ├── frontend/                        # Clinician Web Dashboard (Next.js 15, Tailwind, Canvas)
    │   ├── app/                         # Next.js App Router (paramedic, monitor, and triage views)
    │   ├── components/                  # 60 FPS HTML5 double-buffered WaveformCanvas, HUDs
    │   └── package.json                 # Web frontend dependencies
    ├── backend/                         # Real-Time Telemetry & API Gateway (Node.js / FastAPI)
    │   ├── src/                         # High-performance WebSocket stream broker & REST API
    │   └── app/                         # Python FastAPI microservices & SQLAlchemy models
    ├── dsp_engine/                      # Server-side DSP routines & clinical SVG card generators
    ├── alert_engine/                    # Telegram paramedic dispatch bot worker
    ├── storage/                         # Local & object storage for photos and clinical charts
    │   ├── photos/                      # Triage photo intake storage
    │   └── charts/                      # Auto-rendered 6-panel SVG diagnostic charts
    ├── docker-compose.yml               # Multi-service infrastructure orchestration
    ├── Dockerfile                       # Container definition for API gateway & engines
    ├── run_simulation.ts                # End-to-end multi-patient telemetry simulation script
    └── package.json                     # Server runtime dependencies
```

---

## ⚡ Core Workflows

### 1. Rapid Photo Triage Intake (`POST /api/v1/triage/intake-photo`)
- Paramedic or bystander snaps an intake photo of trauma, burn, pallor, or cyanosis.
- Edge / backend vision engines compute START triage tags and ESI (1–5) severity levels.
- Immediately dispatches a structured notification with photo attachment to the on-duty trauma channel.

### 2. High-Speed Hemodynamic Telemetry (`WSS /api/v1/telemetry/stream/:id`)
- Smartphone camera captures contact PPG (flashlight illuminated) or remote facial rPPG at 30–120+ FPS.
- **Signal Conditioning:** Spatial ROI color tracking (POS/CHROM), 4th-order Butterworth digital IIR filtering ($[0.75-3.5\text{ Hz}]$ bandpass).
- **Extraction:** Pan-Tompkins peak detection, $RR$/$IBI$ interval extraction, time-domain HRV ($SDNN$, $RMSSD$), frequency-domain Welch PSD ($LF/HF$), Poincaré non-linear spread ($SD1/SD2$).
- Real-time frames are rendered on-device and concurrently streamed to the central Clinician HUD at 60 FPS over WebSockets.

### 3. Paramedic Alerting & 6-Panel Diagnostic Cards
- Automated evaluation against National Early Warning Scores (NEWS2 / MEWS).
- Upon critical vital instability, an automated rendering worker synthesizes a **6-Panel Clinical SVG Diagnostic Card** detailing:
  1. Filtered Pulse Waveform
  2. Welch Power Spectral Density (BPM peak)
  3. Inter-Beat Interval ($IBI$) Trend
  4. Poincaré Plot ($RR_{n}$ vs. $RR_{n+1}$)
  5. Second Derivative PPG ($SDPPG$) Morphology
  6. Clinical Summary & NEWS2 Score Breakdown
- Dispatches directly to Telegram with interactive one-tap action buttons:
  `[🚑 Dispatch Ambulance]`, `[👨‍⚕️ Escalate to Trauma ER]`, and `[📈 Open Live Telemetry]`.

---

## 🚀 Quick Start & Development

### Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **Bun** (for mobile client): `curl -fsSL https://bun.sh/install | bash`
- **Android SDK & NDK**: Installed via Android Studio or command-line tools (for mobile native build)
- **Docker & Docker Compose** (optional, for full containerized backend deployment)

---

### 1. Running the Web Platform (`website/`)

#### A. Run End-to-End Simulation
Verify the entire backend, DSP pipeline, and clinical card rendering without hardware sensors:
```bash
cd website
npm install
npm run test:simulation
```

#### B. Launch the Web Telemetry Backend
```bash
cd website
npm run start:backend
```
- **REST & Health Check:** `http://localhost:8000`
- **WebSocket Telemetry Ingestion:** `ws://localhost:8000/api/v1/telemetry/stream/:patient_id`

#### C. Launch the Next.js Clinician Dashboard
In a separate terminal:
```bash
cd website/frontend
npm install
npm run dev
```
Open your browser to:
- **Clinician Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Live 60Hz Telemetry Monitor:** [http://localhost:3000/monitor](http://localhost:3000/monitor)
- **Photo Triage Intake:** [http://localhost:3000/triage](http://localhost:3000/triage)
- **Paramedic Audit Board:** [http://localhost:3000/paramedic](http://localhost:3000/paramedic)

#### D. Full Docker Deployment
```bash
cd website
docker compose up -d
```
Starts TimescaleDB, Redis stream broker, MinIO object storage, and the API gateway.

---

### 2. Running the Mobile App (`mobile/`)

```bash
cd mobile
bun install
```

#### A. Start the Expo Metro Bundler
```bash
bun run start
```

#### B. Launch on Android (Device or Emulator)
```bash
bun run android
```
*(Requires USB debugging enabled on an Android phone or an active Android Virtual Device with camera access)*

---

### 3. Telegram Paramedic Bot Configuration

Configure your bot credentials in `website/.env` (copy from `website/.env.example`):
```ini
TELEGRAM_BOT_TOKEN="your_bot_token_from_botfather"
PARAMEDIC_DEFAULT_CHAT_ID="your_telegram_chat_id"
```
Once configured, all preliminary triage intakes and critical vital threshold events are pushed in real time directly to the paramedic channel with interactive actions.

---

## 📖 Clinical & Technical Reference

- [METHODOLOGY.md](file:///home/xotem/projects/UYIR360-Emergency-Collapse-Triage-Ad-Hoc-Hemodynamic-Monitor/METHODOLOGY.md) – Mathematical foundations, filter cutoff frequencies, Pan-Tompkins tuning, and clinical scoring formulas.
- [ARCHITECTURE_BLUEPRINT.md](file:///home/xotem/projects/UYIR360-Emergency-Collapse-Triage-Ad-Hoc-Hemodynamic-Monitor/ARCHITECTURE_BLUEPRINT.md) – End-to-end data pipelines, WebSocket frame structures, and system topologies.
- [mobile-sensor-health-markers-research.md](file:///home/xotem/projects/UYIR360-Emergency-Collapse-Triage-Ad-Hoc-Hemodynamic-Monitor/mobile-sensor-health-markers-research.md) – Peer-reviewed clinical papers, sensor error margins, and validation protocols.
