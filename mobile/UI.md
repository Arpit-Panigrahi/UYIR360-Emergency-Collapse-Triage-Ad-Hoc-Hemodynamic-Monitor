# UI / UX Design Specifications: "The Intermediator"
## Emergency Vital Monitor & Triage Interface

---

## 1. Executive Summary & Product Context

* **Product Name:** The Intermediator
* **Platform:** Mobile (iOS / Android)
* **Target Audience:** Panicked bystanders (first-responders by circumstance), community health workers in low-resource clinics, and en-route paramedics.
* **Core Purpose:** A rapid-deployment cardiac and respiratory contact monitor that acts as an intelligent intermediary when someone collapses. It guides bystanders on scene, detects life-threatening hemodynamic collapse (triggering instant CPR instructions), and relays real-time telemetry to en-route paramedics or rural healthcare providers.

---

## 2. Core Design Philosophy

### Principle 1: "Calm in Chaos" (Zero Cognitive Overload)
In a sudden collapse, the bystander is experiencing an adrenaline spike, tunnel vision, and trembling hands:
* **Never present dense dashboards or technical metrics by default.**
* Use massive typography, unambiguous iconography, and high-contrast color coding.
* Provide clear, imperative instructions (**"PRESS PHONE TO CHEST"**, **"HOLD STILL"**, **"START CPR NOW"**).

### Principle 2: Progressive Disclosure ("Simple by Default, Deep on Demand")
* **Default View (Bystander Mode):** 3 large vital tiles (Heart Rate, Breathing Rate, Perfusion Status) + Live Action Status Banner.
* **Expanded View (Clinician / Advanced Mode):** Accessible via a swipe-up bottom drawer or toggle: reveals raw 120 FPS PPG waveforms, derivative velocity curves, HRV statistics (RMSSD, SDNN), and respiratory spectral breakdowns.

---

## 3. Screen States & User Flows

### Screen A: Instant Placement & Contact Gauge (First 5 Seconds)
* **Visual Objective:** Guide the user to place the phone camera and flashlight firmly against the victim's sternum (or upper arm).
* **Key Elements:**
  * **Anatomical Placement Graphic:** Clean silhouette indicating the center of the chest (sternum).
  * **Contact Force Bar (Transmural Pressure Indicator):**
    * *Under-pressure (Yellow):* "Press slightly firmer."
    * *Optimal (Solid Green):* Haptic buzz confirmation; measurement starts automatically.
    * *Over-pressure / Blanching (Orange):* "Loosen press slightly."

---

### Screen B: Live Triage & Telemetry (Default State)
* **Top Bar:** 
  * Emergency Call & Relay Status: "🔴 Paramedics Connected / Streaming Live" + 1-Tap "Share Telemetry Link".
  * Elapsed Emergency Timer (e.g., `02:14 since collapse`).
* **Center Tiles (Massive readable numbers):**
  1. **HEART RATE:** e.g., `74` BPM (with a gentle pulsing heart icon synchronized with beat onset).
  2. **RESPIRATION:** e.g., `14` BrPM.
  3. **CIRCULATION / PERFUSION:** e.g., `Stable` / `Low Perfusion` (Perfusion Index indicator).
* **Bottom Bar:** 
  * "Swipe Up for Clinical Telemetry & Raw Curves ⬆️"

---

### Screen C: Anomaly & Emergency Intervention Mode (HIGH PRIORITY)
* **Trigger:** App detects pulselessness (asystole), extreme ventricular rate, or circulatory collapse ($PI < 0.05\%$ + no pulsatile upstroke).
* **Visual Behavior:**
  * The entire UI shifts into a high-visibility, high-urgency **Emergency Red Mode**.
  * **Dominant Action Banner:** **"NO PULSE DETECTED — START CPR NOW"**.
  * **Audio-Visual CPR Metronome:**
    * Pulsing visual disc + loud audible clicker + tactile haptic ticking at **110 BPM** (AHA/ERC guideline: 100–120 compressions/min).
    * Clear counter: `Compression 1 of 30` or continuous hands-only CPR coaching.
    * Big visual prompt: *"Push hard and fast in the center of the chest"*.
  * **Cancel/Override button:** Small secondary button ("Patient is awake / false alarm") to prevent accidental lockouts.

---

### Screen D: Advanced / Clinician Drawer (Progressive Disclosure)
* **Accessed via:** Swipe up or tap on "Clinical View".
* **Components for Paramedics / Field Clinicians:**
  1. **Live Filtered Waveform:** Real-time photoplethysmogram curve (Green-Red differential stream) with marked systolic upstroke feet (Intersecting Tangents).
  2. **Signal Quality Index (SQI) Meter:** Percentage confidence score based on skewness and waveform templates.
  3. **Autonomic / PRV Panel:** RMSSD (ms), SDNN (ms), LF/HF balance.
  4. **Respiratory Multi-Channel Decomposition:** Tabs for Baseline Wander (BW), Amplitude (AM), and Frequency (FM) curves.
  5. **Export / Telemetry Sync:** Copy medical JSON log, generate emergency QR code, or transmit direct WebRTC telemetry to emergency dispatch.

---

## 4. Visual & Interaction Specifications

| Property | Specification |
| :--- | :--- |
| **Color Palette** | Pure Black (`#000000`) background to save OLED battery and maximize contrast; Emergency Red (`#FF2A2A`); Vital Emerald Green (`#00E676`); Warning Amber (`#FFB300`); Soft Cyan for curves (`#00E5FF`). |
| **Typography** | Monospace or tabular figures for numbers (prevents layout jitter as numbers tick). Minimum 48pt for vital metrics, 32pt for emergency banners. |
| **Haptics** | Heavy impact haptics when optimal contact is achieved; rhythmic rigid haptic pulse for the 110 BPM CPR metronome. |
| **Outdoor Legibility** | High-contrast ratio (> 7:1) to remain readable under harsh sunlight if a collapse occurs outdoors on the street. |

---

## 5. Summary Checklist for the Designer
1. [ ] Create the **Landing / Placement Guide** with interactive pressure feedback (Under / Good / Over).
2. [ ] Design the **Bystander Live Card** (simple, giant 3 metrics, panic-proof).
3. [ ] Design the **Emergency CPR Mode** with animated 110 BPM visual metronome and step-by-step coaching.
4. [ ] Design the **Expanded Clinical Drawer** (raw oscilloscope-style PPG trace, SQI gauge, and HRV stats).
5. [ ] Design the **Paramedic Relay status pill / Share Modal** (QR code + web link).
