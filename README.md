# UYIR360: The Intermediator
## Emergency Collapse Triage & Ad-Hoc Hemodynamic Monitor

> **Direct Technical Implementation & Production Extension of [IDEA.md](IDEA.md)**
> An open-source, edge-to-cloud tele-triage and continuous physiological monitoring platform that transforms ubiquitous smartphones into clinical-grade diagnostic instruments during the critical 4–8 minute emergency collapse window.

---

## 🧭 From Concept to Code: Extending the [IDEA.md](IDEA.md) Vision

In acute collapse—sudden cardiac arrest (SCA), agonal respiratory depression, traumatic hemorrhage, or anaphylaxis—**irreversible brain damage starts within 4 to 6 minutes**, yet global emergency medical services (EMS) response times average 7 to 14 minutes. Furthermore, laypersons fail manual pulse checks over **45% of the time**, creating an information void that delays CPR and leaves en-route clinicians blind.

As defined in **[IDEA.md](IDEA.md)**, this platform does not attempt to replace physicians or paramedics. Instead, it serves as **"The Intermediator"**—an intelligent, low-latency bridge between:
1. **The Collapsed Patient** (the biological signal source).
2. **The First-Responder / Bystander on Scene** (the physical operator requiring clear, zero-cognitive-overload instructions).
3. **The En-Route Paramedics & Telemedicine Clinicians** (the clinical decision-makers requiring continuous, quantitative vital telemetry).

This repository is the full production realization of that vision, implementing edge digital signal processing (DSP), high-speed camera acquisition, real-time WebSocket streaming, and automated multi-biomarker diagnostic cards.

---

## 🏛️ Realization of the 4 Functional Pillars

| Pillar in [IDEA.md](IDEA.md) | Clinical Intent | Codebase Implementation |
| :--- | :--- | :--- |
| **Pillar A: Instantaneous Contact Triage (< 5s)** | Turn phone flash + camera into a contact hemodynamic sensor on chest or arm with pressure guidance to avoid capillary occlusion. | • [`mobile/android/.../highspeed/`](mobile/android/app/src/main/java/com/anonymous/khunChosepseudonameonly/highspeed/) (120+ FPS Camera2 driver)<br>• [`mobile/src/processing/pressure/ContactPressureGauge.ts`](mobile/src/processing/pressure/ContactPressureGauge.ts)<br>• [`mobile/src/processing/spatial/OptROIS.ts`](mobile/src/processing/spatial/OptROIS.ts) |
| **Pillar B: Actionable Directions & CPR Guidance** | Immediate detection of asystole, v-tach, or agonal breathing; switches to 100–120 BPM audio/haptic CPR metronome and START/ESI triage. | • [`mobile/components/VitalMeasurementScreen.tsx`](mobile/components/VitalMeasurementScreen.tsx)<br>• [`website/frontend/components/CPRMetronome.tsx`](website/frontend/components/CPRMetronome.tsx)<br>• [`mobile/src/processing/triage/TriageEngine.ts`](mobile/src/processing/triage/TriageEngine.ts) |
| **Pillar C: Live Telemetry Paramedic Relay** | Continuous telemetry relay to dispatch and en-route ambulances; automated Telegram alerts with interactive action buttons. | • [`website/backend/src/index.ts`](website/backend/src/index.ts) (30–60Hz WebSocket broker)<br>• [`website/alert_engine/telegram_bot.py`](website/alert_engine/telegram_bot.py)<br>• [`website/backend/src/dsp/cardGenerator.ts`](website/backend/src/dsp/cardGenerator.ts) (6-panel SVG card) |
| **Pillar D: Progressive Disclosure** | Simple traffic-light UI for panicked bystanders; deep real-time waveforms, HRV, and SDPPG vascular metrics for clinicians. | • **Layperson View**: Big color cards in [`mobile/components/`](mobile/components/)<br>• **Clinician View**: 60 FPS HTML5 Canvas HUD in [`website/frontend/components/ClinicianHUD.tsx`](website/frontend/components/ClinicianHUD.tsx) |

---

## 👥 Personas to System Mapping

As outlined in **[IDEA.md Section 4](IDEA.md#4-target-personas)**, the platform serves three distinct operational environments:

### 1. The Panicked Bystander (Subway, Home, Public Space)
- **Primary Need:** *"Is this person alive? What do I do right now? Guide my hands."*
- **Application Response (`mobile/`):**
  - Instantly guides phone placement on sternum or limb with contact-pressure haptics.
  - If zero pulsatility is identified, triggers full-screen flashing **"START CPR NOW"** with a synchronized 110 BPM acoustic metronome.
  - Zero medical jargon; massive high-contrast tap targets.

### 2. The En-Route Paramedic (Ambulance Mobile Data Terminal / Telegram)
- **Primary Need:** *"What is their rhythm, perfusion index, and respiratory trend before we arrive?"*
- **Application Response (`website/`):**
  - Receives high-priority Telegram message containing an auto-rendered **6-Panel Clinical SVG Diagnostic Card**.
  - Taps `[🚑 Dispatch Ambulance]`, `[👨‍⚕️ Escalate to Trauma ER]`, or `[📈 Open Live Telemetry]`.
  - Views the 60 FPS double-buffered waveform stream with instantaneous MEWS/NEWS2 deterioration alerts.

### 3. The Community Health Worker (Rural Clinic, Low-Resource Setting)
- **Primary Need:** *"A zero-cost portable monitor to track vital stability and triage deterioration without expensive multi-parameter bedside monitors."*
- **Application Response (`mobile/` + `website/`):**
  - Completely local execution on commodity Android smartphones without cloud dependency.
  - Calculates Second Derivative PPG ($SDPPG$) vascular elasticity markers ($b/a, c/a, d/a, e/a$) and continuous respiration rate ($RR$) via respiratory-induced intensity variation (RIIV/RSA).

---

## 📂 Monorepo Structure

```
UYIR360-Emergency-Collapse-Triage-Ad-Hoc-Hemodynamic-Monitor/
├── IDEA.md                              # Foundational Product Vision & Clinical Problem Statement
├── README.md                            # Technical Implementation Guide (Extension of IDEA.md)
├── METHODOLOGY.md                       # Peer-reviewed mathematical foundations & DSP formulations
├── ARCHITECTURE_BLUEPRINT.md            # Edge-to-cloud schemas, WebSocket frame specs, and topologies
├── mobile-sensor-health-markers-research.md # Clinical validation literature & error margin benchmarks
│
├── mobile/                              # Mobile Edge Client (React Native / Expo & Android Native)
│   ├── app/                             # Expo Router tab layouts and screen stacks
│   ├── android/                         # Android Native module (Camera2 120 FPS high-speed bridge)
│   │   ├── app/src/main/java/.../highspeed/ # Native camera view, SciPy bridge, offline processor
│   │   └── build.gradle                 # Native Gradle build scripts
│   ├── components/                      # UI components (VitalMeasurementScreen, Themed, Skia)
│   ├── src/
│   │   ├── processing/                  # On-Device Clinical DSP Engine
│   │   │   ├── cardio/                  # Fiducial peak detector (Pan-Tompkins) & PRV analyzer
│   │   │   ├── dsp/                     # Butterworth 4th-order IIR filters & PCHIP resamplers
│   │   │   ├── hemodynamics/            # Perfusion Index (PI) & SpO2 proxy estimators
│   │   │   ├── morphology/              # SDPPG vascular aging & elasticity analysis
│   │   │   ├── pipeline/                # HemodynamicPipeline orchestrator
│   │   │   ├── pressure/                # Contact pressure compliance gauge
│   │   │   ├── respiration/             # RIIV / RSA respiratory extraction engine
│   │   │   ├── spatial/                 # POS / CHROM blind color separation & OptROIS
│   │   │   └── triage/                  # START & ESI emergency triage classifier
│   │   └── services/                    # Edge Telegram dispatch & remote state sync
│   └── package.json                     # Mobile runtime dependencies & scripts
│
└── website/                             # Telemetry Web Platform & Tele-Triage Ingestion Server
    ├── frontend/                        # Clinician Web Dashboard (Next.js 15 App Router)
    │   ├── app/                         # Pages: / (overview), /monitor (telemetry), /paramedic (feed)
    │   ├── components/                  # 60 FPS HTML5 double-buffered WaveformCanvas, HUDs
    │   └── package.json                 # Web frontend dependencies
    ├── backend/                         # Dual Node.js + Python Telemetry Server
    │   ├── src/                         # Node.js 22 high-frequency WebSocket broker & REST API
    │   └── app/                         # Python FastAPI microservices & SQLAlchemy models
    ├── dsp_engine/                      # Server-side DSP routines & automated 6-panel SVG generator
    ├── alert_engine/                    # Telegram paramedic dispatch bot worker
    ├── storage/                         # Persistent local & object storage
    │   ├── photos/                      # Triage photo intakes (.gitkeep preserved)
    │   └── charts/                      # Auto-rendered 6-panel clinical diagnostic cards (.gitkeep preserved)
    ├── docker-compose.yml               # Multi-container orchestration (TimescaleDB, Redis, MinIO)
    ├── Dockerfile                       # Container build recipe for backend services
    ├── run_simulation.ts                # End-to-end multi-patient telemetry simulation
    └── package.json                     # Server runtime dependencies
```

---

## 🔬 Mathematical & DSP Foundations

For the comprehensive mathematical derivations, filter transfer functions, and clinical scoring formulas, refer directly to **[METHODOLOGY.md](METHODOLOGY.md)**:

- **Bandpass Filtering:** 4th-order Butterworth digital IIR filter ($[0.75 - 3.5\text{ Hz}]$ for pulse, $[0.1 - 0.5\text{ Hz}]$ for respiration).
- **Spatial Color Separation:** Plane-Orthogonal-to-Skin (POS) projection matrix extracting pulsatile blood volume changes:
  $$S = P \cdot C_n$$
- **PRV Extraction:** Inter-Beat Interval ($IBI$) series derived from Pan-Tompkins derivative squaring and adaptive dual-threshold peak detection.
- **Heart Rate Variability:**
  - $SDNN = \sqrt{\frac{1}{N-1}\sum_{i=1}^N (RR_i - \overline{RR})^2}$
  - $RMSSD = \sqrt{\frac{1}{N-1}\sum_{i=1}^{N-1} (RR_{i+1} - RR_i)^2}$ (vagal tone indicator)
  - Autonomic balance: $LF / HF$ ratio via Welch Power Spectral Density.
- **Vascular Morphology:** Second Derivative of Photoplethysmogram ($SDPPG$):
  $$\frac{d^2 y}{dt^2} \longrightarrow \text{extract } a, b, c, d, e \text{ waves} \longrightarrow \text{compute } b/a, c/a, d/a, e/a$$

---

## 🚀 Quick Start Guide

### 1. Running the Web Platform (`website/`)

#### Option A: Verification Simulation
Simulate a complete 3-flow cycle (Photo Intake $\to$ 60Hz Telemetry $\to$ Critical Alert $\to$ 6-Panel SVG Card):
```bash
cd website
npm install
npm run test:simulation
```

#### Option B: Live Server & Clinician Dashboard
```bash
# Terminal 1: Launch Backend WebSocket Broker (Port 8000)
cd website
npm run start:backend

# Terminal 2: Launch Next.js Clinician HUD (Port 3000)
cd website/frontend
npm run dev
```

Browse to:
- **Clinician Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Live 60Hz Waveform Monitor:** [http://localhost:3000/monitor](http://localhost:3000/monitor)
- **Photo Triage Intake:** [http://localhost:3000/triage](http://localhost:3000/triage)
- **Paramedic Audit Board:** [http://localhost:3000/paramedic](http://localhost:3000/paramedic)

---

### 2. Running the Mobile App (`mobile/`)

```bash
cd mobile
bun install
```

#### Launch Expo Dev Server
```bash
bun run start
```

#### Run on Android Device / Emulator (with 120 FPS Camera2 Support)
```bash
bun run android
```
*(Ensure an Android phone with USB debugging or an active AVD emulator is connected)*

---

### 3. Telegram Paramedic Bot Configuration

To connect live emergency alerts to an on-duty paramedic chat, set credentials in `website/.env` (see `website/.env.example`):
```ini
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
PARAMEDIC_DEFAULT_CHAT_ID="your_paramedic_chat_id"
```

---

## 📚 Further Documentation

- **[IDEA.md](IDEA.md)**: Product vision, first-response blind spot, and core functional pillars.
- **[METHODOLOGY.md](METHODOLOGY.md)**: Exhaustive DSP algorithms, physiological transfer functions, and clinical references.
- **[ARCHITECTURE_BLUEPRINT.md](ARCHITECTURE_BLUEPRINT.md)**: Comprehensive systems architecture and edge-to-cloud schemas.
- **[mobile-sensor-health-markers-research.md](mobile-sensor-health-markers-research.md)**: Academic validation literature and clinical benchmarks.
