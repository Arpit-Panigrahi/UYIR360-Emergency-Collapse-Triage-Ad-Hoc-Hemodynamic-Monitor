# High-Speed Contact Photoplethysmography (sPPG) & Hemodynamic DSP Methodology
## Targeted for Chest and Arm Cutaneous Site Placement (120+ FPS Mobile Sensing)

---

## 1. Physiological & Anatomical Context (Chest vs. Arm vs. Finger)

Transitioning the contact site from the fingertip to the **sternum/chest** or **forearm/bicep** introduces key physical and physiological differences that govern signal acquisition:

| Parameter | Fingertip (Conventional) | Arm / Forearm | Sternum / Chest |
| :--- | :--- | :--- | :--- |
| **Microvascular Bed** | Dense arteriolar arches & glomus bodies | Moderate capillary & subcutaneous plexus | Sternal cutaneous plexus over osseous backplate |
| **Typical Perfusion Index ($PI$)** | $1.0\% - 5.0\%$ | $0.15\% - 0.8\%$ | $0.2\% - 1.2\%$ |
| **Tissue Thickness & Depth** | 5–8 mm tissue pulp | Variable muscle & subcutaneous adipose | Thin subcutaneous layer directly above sternum |
| **Mechanical Coupling** | Minimal bulk motion | Arm tremor & muscle micro-tremor | Direct ballistic coupling with heart & chest wall breathing excursions |
| **Respiratory Modulation** | Autonomic RSA & intrathoracic pressure | Autonomic RSA | Direct physical chest-wall expansion + RSA |

### Critical Anatomical Advantages of the Chest Site
1. **Osseous Backplate Support:** The sternum provides an unyielding bony backing. When the phone is pressed against the chest, tissue cannot indefinitely deflect away, providing stable transmural pressure stabilization.
2. **Dual-Modal Respiratory Coupling:** In addition to hemodynamic baseline shifts (venous return variation), breathing physically modulates the contact force between the chest wall and the camera lens, producing strong, unambiguous **Baseline Wander (BW)** and **Amplitude Modulation (AM)** signals.

---

## 2. Hardware, Illumination & Thermal Engineering

### 2.1 Adjustable LED Flash Power & Thermal Management
* Smothering a smartphone LED against the skin traps heat. Left unmanaged at 100% duty cycle, high-intensity LEDs can cause thermal discomfort/skin burns within 30–60 seconds and induce thermal dark-current sensor noise.
* **App Control:** Provide the user with an explicit LED intensity slider/preset (default: **30%–40% power** on devices supporting torch intensity APIs).
* **Benefits:**
  * Prevents thermal tissue injury.
  * Extends operational battery life.
  * Prevents CMOS pixel saturation near the emitter.

### 2.2 Camera Configuration & Anti-Throttling Profile
* **Target Frame Rate:** $\ge 120\text{ FPS}$ (or $240\text{ FPS}$ if supported by the hardware format).
* **Preview Resolution:** Lock to the lowest preview resolution that supports maximum FPS (typically **480p ($640 \times 480$)** or **720p ($1280 \times 720$)**).
  * *Rationale:* Capturing 1080p or 4K at 120/240 FPS overwhelms the mobile ISP, triggering aggressive OS thermal throttling, dropped frames, and memory thrashing within 20–30 seconds.
* **Hardware 3A Lock:**
  * **Auto-Exposure:** Disabled. Exposure time clamped between $1.0\text{ ms}$ and $2.5\text{ ms}$ to suppress rolling-shutter spatial skew and motion blur.
  * **Auto-Focus:** Disabled and locked to macro/infinity.
  * **Auto-White-Balance:** Disabled and locked.

---

## 3. Real-Time Spatial Processing: OptROIS & Dual-Channel Differential Extraction

Because the entire lens is covered by skin, traditional skin segmentation algorithms (e.g., YCrCb bounds) are obsolete. Instead, illumination variance dominates across the sensor due to the lateral offset between the camera aperture and the LED torch.

```
┌──────────────────────────────────────────────────────────┐
│                      CMOS SENSOR PLANE                   │
│                                                          │
│  [Near Flash]        [Optimal Transillumination] [Periphery]
│  Saturated / Glare    Max AC/DC Pulsatile SNR     Low Light / Noise
│  (R/G > 240)         (Selected OptROIS blocks)   (G < 20)
│   ❌ REJECT                  ✅ ACCUMULATE              ❌ REJECT
└──────────────────────────────────────────────────────────┘
```

### 3.1 Dynamic Grid-Based SNR Optimizer
1. Subdivide the frame into an $8 \times 8$ uniform grid (64 spatial sub-blocks).
2. For each block $k$, compute the block-mean intensities: $\mu_R(k)$, $\mu_G(k)$, and $\mu_B(k)$.
3. **Hard Rejection Criteria:**
   * Reject if $\mu_R(k) > 245$ or $\mu_G(k) > 240$ (sensor saturation/flare zone).
   * Reject if $\mu_G(k) < 15$ (insufficient photon penetration; shot-noise dominated).
4. **SNR Scoring:**
   Over a rolling 1.0-second calibration window, compute the pulsatile Signal-to-Noise Ratio for valid blocks:
   $$\text{SNR}_k = \frac{\sigma(G_k)}{\mu(G_k)}$$
5. **Dynamic Masking:** Select and spatially average only the **top 15%–20% highest-SNR blocks**.
6. **Zero-Allocation Data Pipeline:** Frame buffers are discarded immediately in C++/Worklet memory. Only the scalar tuple $(t_i, R_i, G_i)$ is pushed to a typed ring buffer in JS memory (~86 KB for 90 seconds at 120 FPS).

### 3.2 Green-Red Difference (GRD) Motion Suppression
In low-perfusion contact sites (chest/arm, $PI \le 1.0\%$), micro-motion of the camera against tissue creates dominant common-mode noise across all color channels. 
* Green light ($520-565\text{ nm}$) exhibits high oxy-/deoxy-hemoglobin absorption with shallow cutaneous penetration ($\sim 0.5-1.0\text{ mm}$), carrying the primary pulsatile volumetric change ($AC_G$).
* Red light ($620-700\text{ nm}$) penetrates deeper ($\sim 2-4\text{ mm}$) and carries less relative pulsatile modulation while remaining equally sensitive to physical motion, contact force fluctuation, and baseline deformation.
* **GRD Normalized Pulse Stream:**
  $$S_{\text{pulse}}(t) = \frac{G(t) - \bar{G}}{\bar{G}} - \alpha \cdot \left(\frac{R(t) - \bar{R}}{\bar{R}}\right)$$
  where $\alpha = \frac{\sigma(G)}{\sigma(R)}$ is adaptively updated over a 2-second moving window. This differential cancellation suppresses mechanical contact noise by up to $30-40\%$ before filtering.

---

## 4. Contact Pressure & Transmural Optimization for Chest/Arm

Contact force directly dictates vessel compliance via the transmural pressure principle:
$$P_{\text{transmural}} = P_{\text{internal}} - P_{\text{external}}$$
Maximum pulsatile amplitude occurs when $P_{\text{external}} \approx P_{\text{internal}}$ ($P_{\text{transmural}} \approx 0$).

### Real-Time Force Gauge Implementation:
* **Under-Pressure (Air Gap / Weak Coupling):**
  * Symptom: Low $AC_G$, high baseline volatility, low DC green transmission.
  * Guidance UI: *"Press phone slightly firmer against skin"*.
* **Over-Pressure (Capillary & Arteriolar Blanching):**
  * Symptom: DC transmission surges as blood is forced out of the capillary bed, while $AC_G$ pulsatile amplitude collapses below $0.05\%$.
  * Guidance UI: *"Pressing too hard — loosen contact slightly"*.
* **Optimal Range:**
  * When $PI = (AC_G / DC_G) \times 100 \ge 0.15\%$ and waveform exhibits rhythmic pulsatile morphology, trigger a haptic confirmation and begin the 60–90 second test sequence.
* **Pressure Stability Gating:** If variance $\Delta \mu_G / \mu_G > 5\%$ over a 500 ms window, mark segment as pressure-unstable to avoid corrupting HRV and surrogate $SpO_2$ calculations.

---

## 5. Cardiovascular & PRV Signal Processing

### 5.1 Preprocessing & Uniform Jitter Correction
1. **Resampling:** Frame delivery timestamps $t_i$ exhibit micro-jitter ($\pm 1-2\text{ ms}$). Interpolate the raw signal onto an exact, uniform $120.0\text{ Hz}$ time vector using piecewise cubic Hermite interpolation (PCHIP).
2. **Bandpass Filtering:** Apply a zero-phase 4th-order Butterworth bandpass filter ($0.75 - 3.5\text{ Hz} \equiv 45 - 210\text{ BPM}$) via forward-backward filtering (`filtfilt`).

### 5.2 Fiducial Timing: Intersecting Tangents (IT) & Maximum First Derivative ($M1D$)
To eliminate timing jitter caused by rounded or morphologically shifting systolic peaks:
1. **Primary Timing Method — Intersecting Tangents (IT):**
   * Identify the diastolic minimum $(t_{\text{min}}, V_{\text{min}})$ and the maximum first derivative point $(t_{M1D}, V_{M1D})$ on the systolic upstroke.
   * Calculate upstroke tangent slope $m = G'(t_{M1D})$.
   * Compute the intersection of the horizontal diastolic baseline $y = V_{\text{min}}$ and the upstroke tangent $y - V_{M1D} = m(t - t_{M1D})$:
     $$t_{\text{foot}} = t_{M1D} - \frac{V_{M1D} - V_{\text{min}}}{m}$$
   * *Rationale:* The IT fiducial point combines two physiological landmarks (onset and maximum acceleration slope), yielding clinical-grade beat-to-beat interval accuracy ($\text{RMSE} \le 5.7\text{ ms}$, $r^2 > 0.99$ vs. ECG R-R) and superior resilience to low-perfusion distortion over raw peak or single-threshold detection.
2. **Secondary Reference — $M1D$:**
   * Steepest inflection point $G'(t) = \frac{d}{dt} G(t)$ used for morphology verification and crest time delineation.

### 5.3 Multi-Tier Signal Quality Index (SQI) Protocol
Before committing intervals to PRV metrics, every cycle is validated through four gates:
1. **Perfusion Index Check ($PI_{\text{SQI}}$):** Discard windows where $PI < 0.15\%$.
2. **Morphological Template Correlation ($r_{\text{SQI}}$):**
   * Maintain a running ensemble average beat template $\bar{P}$ (100 resampled points).
   * For beat $k$, compute Pearson correlation coefficient $r(P_k, \bar{P})$.
   * If $r < 0.85$, reject the beat as a motion artifact or premature slip.
3. **Statistical Skewness ($S_{\text{SQI}}$):**
   * Clean arterial volume pulses demonstrate positive skewness ($S > 0$) due to the steep systolic upstroke and prolonged diastolic decay:
     $$S = \frac{\frac{1}{N} \sum_{i=1}^N (x_i - \bar{x})^3}{\sigma^3}$$
   * If $S \le 0$, mark beat as corrupted by baseline slope or motion artifact.
4. **Zero-Crossing Integrity ($Z_{\text{SQI}}$):**
   * Within a single genuine cardiac cycle, the bandpassed first derivative $G'(t)$ must exhibit exactly two zero crossings (one systolic crest, one diastolic trough). Cycles with $> 2$ crossings are rejected as containing high-frequency tremor.
5. **Physiological Boundary Filtering:** Discard intervals with $IBI < 0.28\text{ s}$ ($> 214\text{ BPM}$) or $IBI > 1.40\text{ s}$ ($< 42\text{ BPM}$), or sudden jump $|\Delta IBI| > 0.25\text{ s}$.

### 5.4 Autonomic Nervous System (PRV / HRV) Metrics
* **Time Domain:**
  * **Mean HR & Median HR** (BPM).
  * **SDNN (ms):** Standard deviation of valid $NN$ intervals.
  * **RMSSD (ms):** Root mean square of successive differences (parasympathetic marker).
  * **pNN50 (%):** Percentage of adjacent $NN$ intervals differing by $> 50\text{ ms}$.
* **Frequency Domain:**
  * Resample valid $IBI$ series to $4.0\text{ Hz}$ via cubic spline interpolation.
  * Compute Welch Power Spectral Density (PSD) with 50% overlapping Hanning windows.
  * Integrate spectral bands:
    * **VLF:** $0.0033 - 0.04\text{ Hz}$
    * **LF:** $0.04 - 0.15\text{ Hz}$ (Sympathetic + Parasympathetic)
    * **HF:** $0.15 - 0.40\text{ Hz}$ (Parasympathetic / Vagal tone)
    * **$LF/HF$ Ratio & Normalized Units ($LF_{nu}, HF_{nu}$)**.
* **Non-Linear Dynamics:**
  * Poincaré Plot geometry: **$SD_1$** (short-term variability) and **$SD_2$** (long-term variability).

---

## 6. Vascular Aging & Morphology (SDPPG / APG)

The high temporal resolution of $120+\text{ FPS}$ ($\le 8.33\text{ ms}$ per sample) preserves the high-frequency inflection components of the cardiac wave, enabling Second Derivative Photoplethysmogram (SDPPG) extraction:

$$\text{SDPPG}(t) = \frac{d^2}{dt^2} G(t) \cdot f_s^2$$

Within each cardiac cycle, locate the 5 classic fiducial points:
1. **$a$-wave:** Early systolic positive acceleration.
2. **$b$-wave:** Early systolic deceleration (trough).
3. **$c$-wave:** Late systolic re-acceleration.
4. **$d$-wave:** Late systolic deceleration.
5. **$e$-wave:** Early diastolic dicrotic notch.

### Clinical Indices Computed:
* **Aging Index (AGI):**
  $$\text{AGI} = \frac{b - c - d - e}{a}$$
  *(Directly correlates with arterial compliance, vascular stiffness, and vascular age).*
* **$b/a$ Ratio:** Reflects arterial stiffness and peripheral resistance.
* **Crest Time ($CT$):** Time elapsed from systolic foot to systolic peak ($\text{ms}$).

---

## 7. Respiratory Rate: Tri-Modal Smart Fusion & Dual-Domain Validation

Chest placement provides direct physical coupling to respiratory excursions. The rib cage movement drives optical transmission changes, while autonomic RSA alters beat frequency.

```
                           Raw Contact Green Stream
                                      │
                   ┌──────────────────┼──────────────────┐
                   ▼                  ▼                  ▼
          [Baseline Wander (BW)]   [Amplitude (AM)]   [Frequency (FM)]
          Low-Pass Filter          Peak-to-Foot       Beat-to-Beat IT
          (0.1 - 0.4 Hz)           Envelope Delta     Instantaneous HR
                   │                  │                  │
                   └──────────────────┼──────────────────┘
                                      │
                   [Dual-Domain: AR Modeling + Time-Domain Counting]
                                      │
                      [Spectral Peak & Pole Magnitude Vote]
                                      │
                         Final Respiration (BrPM)
```

### 7.1 The Three Extraction Channels
1. **Baseline Wander (BW):**
   * Isolates low-frequency baseline movement via a 3rd-order Butterworth bandpass filter ($0.1 - 0.4\text{ Hz} \equiv 6 - 24\text{ BrPM}$).
   * On the chest, BW directly tracks physical rib cage excursions.
2. **Amplitude Modulation (AM):**
   * Track systolic peak amplitudes and diastolic foot amplitudes across cycles.
   * Interpolate upper and lower envelopes; compute the difference wave $(V_{\text{peak}} - V_{\text{foot}})$.
   * Reflects respiratory variations in intrathoracic pressure and stroke volume.
3. **Frequency Modulation (FM / RSA):**
   * Extract the beat-to-beat Intersecting Tangent interval series.
   * Resample at $4.0\text{ Hz}$ via cubic spline and subtract its mean.
   * Reflects vagally mediated Respiratory Sinus Arrhythmia.

### 7.2 Smart Fusion & Pole Conditioning Decision Logic
1. **Autoregressive (AR) Modeling with Pole Magnitude Conditioning:**
   * Fit an AR model of order 8–10 to each channel (BW, AM, FM) to obtain high-resolution spectral estimates over 30-second sliding windows.
   * **Pole Magnitude Threshold:** Identify poles $z_i = r_i e^{j\theta_i}$. Reject any candidate spectral peak if its corresponding pole radius $r_i < 0.90$. This prevents spurious noise pole-splitting from being identified as a respiratory peak.
2. **Time-Domain Dual Check on BW:**
   * Because chest contact couples directly with rib movement, run a time-domain zero-crossing and peak-valley detector on the bandpassed BW channel.
   * If time-domain breath count agrees within $\pm 1.5\text{ BrPM}$ of the spectral peak, assign high confidence ($w = 1.0$).
3. **Consensus Voting:**
   * If two spectral estimates match within $\pm 0.03\text{ Hz}$ ($\le 1.8\text{ breaths/min}$), take the mean of the agreeing pair.
   * If all three diverge, rank candidates by their Spectral Peak-to-Noise Ratio (SPNR) and select the highest-confidence peak verified by the time-domain BW counter:
     $$\text{RR} = f_{\text{consensus}} \times 60$$

---

## 8. Hemodynamics & Optical Perfusion ($SpO_2$ Proxy)

Using the sub-saturated blocks from the Red channel alongside the Green channel:
1. Compute the AC pulsatile component ($\sigma$) and DC background baseline ($\mu$) for both channels:
   $$\text{AC}_R = \text{std}(R), \quad \text{DC}_R = \text{mean}(R)$$
   $$\text{AC}_G = \text{std}(G), \quad \text{DC}_G = \text{mean}(G)$$
2. **Perfusion Index ($PI$):**
   $$PI_G = \left(\frac{\text{AC}_G}{\text{DC}_G}\right) \times 100, \quad PI_R = \left(\frac{\text{AC}_R}{\text{DC}_R}\right) \times 100$$
3. **Reflectance-Mode Pathlength Corrected Ratio of Ratios ($R$):**
   In reflectance contact mode (chest/arm), optical pathlengths differ significantly between green and red wavelengths:
   $$R = \frac{\text{AC}_R / \text{DC}_R}{\text{AC}_G / \text{DC}_G} \cdot \left(\frac{\text{DPF}_G}{\text{DPF}_R}\right)$$
   where $\frac{\text{DPF}_G}{\text{DPF}_R} \approx 0.65$ compensates for the deeper mean penetration depth of red photons in subcutaneous tissue.
4. **Empirical Calibration Curve:**
   $$\text{SpO}_{2\text{-surrogate}} = \text{clip}(110.0 - 25.0 \times R, \, 85.0, \, 100.0)\%$$
   *Note: Gated by the contact pressure stability check (§4). If pressure instability is flagged, the surrogate value is held or marked as uncalibrated.*

---

## 9. [ADD-ON / ROADMAP ARCHITECTURE] Multimodal IMU & Seismocardiography Fusion

> [!IMPORTANT]
> **IMPLEMENTATION STATUS: OPTIONAL FUTURE ADD-ON (NOT IMPLEMENTED IN CURRENT PIPELINE)**
> The algorithms in this section describe an advanced multimodal extension leveraging the mobile device's inertial measurement unit (IMU). This is **not** part of the current active camera-only pipeline and is documented here as a planned future development track.

When holding the smartphone firmly against the sternum, the device physically couples not only with cutaneous optical blood flow but also with the mechanical vibrational waves generated by the heart:

```
┌────────────────────────────────────────────────────────────────────────┐
│              FUTURE ADD-ON: DUAL-PHYSICS STERNAL ACQUISITION           │
│                                                                        │
│   [Camera Sensor @ 120 FPS]              [IMU Accelerometer @ 100-200 Hz]│
│        Cutaneous Optical Flow                  Mechanical SCG / Balistics│
│                  │                                         │             │
│                  ▼                                         ▼             │
│        [Raw Optical Pulse G(t)]                [Sterno-Vibrational a_z(t)]│
│                  │                                         │             │
│                  └────────────┬────────────────────────────┘             │
│                               ▼                                          │
│             [Normalized LMS (NLMS) Adaptive Denoising]                   │
│             Noise reference = IMU motion vectors                         │
│                               │                                          │
│                               ▼                                          │
│             [SCG AO-Peak vs. Optical Foot Cross-Validation]              │
└────────────────────────────────────────────────────────────────────────┘
```

### 9.1 Add-On Component A: IMU-Referenced Adaptive Motion Denoising (NLMS)
* **Principle:** Micro-slipping and hand tremors modulate the optical signal. Because the 3-axis accelerometer $[a_x(t), a_y(t), a_z(t)]$ measures device motion directly, it serves as the reference noise input $x(n)$ to an adaptive filter.
* **Normalized Least Mean Squares (NLMS) Filter:**
  $$e(n) = d(n) - \mathbf{w}^T(n) \mathbf{x}(n)$$
  $$\mathbf{w}(n+1) = \mathbf{w}(n) + \frac{\mu}{\|\mathbf{x}(n)\|^2 + \epsilon} e(n) \mathbf{x}(n)$$
  where $d(n)$ is the raw optical contact stream and $e(n)$ is the motion-cancelled optical PPG output.

### 9.2 Add-On Component B: Seismocardiography (SCG) Timing Validation
* **Mechanical Fiducial Cross-Check:** The $Z$-axis linear acceleration (perpendicular to the sternum) captures the **Aortic Valve Opening ($AO$)** peak of the cardiac cycle.
* **Physiological Cross-Gating:**
  * In clean cardiac cycles, the mechanical $AO$ peak must precede the peripheral optical systolic foot ($t_{\text{foot}}$) by a physiological pre-ejection period ($PEP \approx 50-120\text{ ms}$).
  * If an optical beat foot detected by the camera has no corresponding $AO$ acceleration complex in the preceding $150\text{ ms}$, the beat is flagged as an optical motion artifact rather than a true ventricular contraction.
