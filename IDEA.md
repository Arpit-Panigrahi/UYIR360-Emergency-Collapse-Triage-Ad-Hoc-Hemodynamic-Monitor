# Product Vision & Core Concept: "The Intermediator"
## Emergency Collapse Triage & Ad-Hoc Hemodynamic Monitor

---

## 1. The Core "Why" (Mission & Problem Statement)

### The First-Response Blind Spot: The Critical 4–8 Minute Window
When a human collapses from sudden cardiac arrest (SCA), severe respiratory depression, anaphylaxis, or trauma:
1. **The Clock Starts:** Irreversible brain damage begins within **4 to 6 minutes** of circulatory collapse.
2. **The Information Void:** Bystanders call emergency services (EMS/paramedics). While paramedics are en route (average response time: 7–14 minutes), bystanders are panicked, unable to accurately assess carotid pulses (studies show laypersons fail pulse checks $>45\%$ of the time and waste crucial seconds), and cannot convey quantitative telemetry.
3. **Delayed Action:** CPR is delayed because callers cannot confidently verify if the patient is pulseless, gasping (agonal breathing), or simply syncope/fainting.

### Global Healthcare Inequity: Low-Resource & Wilderness Settings
In rural clinics, developing economies, or disaster triage centers:
* Multi-parameter patient monitors (ECG, capnography, clinical pulse oximeters) cost thousands of dollars, require steady power, and are frequently unavailable.
* A ubiquitous smartphone capable of **instantaneous contact photoplethysmography (sPPG) on the chest or arm** turns any mobile phone into an emergency bedside monitor.

---

## 2. Product Identity: "The Intermediator"

This application does not replace doctors or paramedics; it acts as an **intelligent, real-time hemodynamic intermediator** between:
1. **The Collapsed Patient** (the physiological source).
2. **The First-Responder / Bystander on Scene** (the physical operator providing hands-on stabilization).
3. **The En-Route Paramedics / Telemedicine Triage** (the clinical decision-makers receiving live vital telemetry).

---

## 3. Core Functional Pillars

### Pillar A: Instantaneous Contact Triage (< 5 Seconds)
* The user presses the phone camera/flash directly against the patient's sternum or upper arm.
* Automatic contact-pressure guidance ("Press firmer" / "Optimal contact") ensures reliable signal acquisition within seconds even in chaotic environments.

### Pillar B: Actionable, High-Stakes Directions (CPR Guidance)
* If the system detects **zero pulsatility / asystole / extreme ventricular tachyarrhythmia**:
  * The screen immediately switches to high-contrast **"START CPR NOW"** mode.
  * Emits an audible and haptic 100–120 BPM CPR metronome.
  * Directs the user with concise, unambiguous voice/visual prompts.
* If respiratory failure is detected (< 6 BrPM or agonal breathing), it prompts rescue breathing or airway clearance.

### Pillar C: Live Telemetry Paramedic Relay
* Generates a 1-tap emergency relay link or WebRTC data stream.
* En-route paramedics or the 911 dispatcher can observe real-time HR, RR, Perfusion Index, and waveform morphology before arriving on scene.

### Pillar D: Progressive Disclosure ("Simple by Default, Deep on Demand")
* **Layperson Mode (Default):** Huge traffic-light status cards, clear vital numbers (Heart Rate, Breathing, Perfusion), and giant emergency action commands. Zero cognitive overload during high-adrenaline emergencies.
* **Clinician / Paramedic Mode (Slide/Toggle):** Unveils raw real-time photoplethysmogram waveforms, derivative velocity curves, HRV time-domain stats (SDNN, RMSSD), SDPPG vascular aging markers, and tri-modal respiratory spectral breakdowns.

---

## 4. Target Personas

| Persona | Environment | Primary Need |
| :--- | :--- | :--- |
| **Panicked Bystander** | Public space, subway, home | "Is this person alive? What do I do right now? Guide my hands." |
| **En-Route Paramedic** | Ambulance dispatch screen | "What is their actual rhythm, perfusion index, and respiratory trend right now?" |
| **Community Health Worker** | Remote clinic, rural village | "A portable, zero-cost monitor to track vital stability and triage deterioration." |
