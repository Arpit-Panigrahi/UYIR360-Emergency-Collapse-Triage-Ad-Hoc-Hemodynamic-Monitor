/**
 * Green-Red Difference (GRD) Motion Suppression
 * Section 3.2 of METHODOLOGY.md
 *
 * Formula:
 * S_pulse(t) = ((G(t) - G_bar) / G_bar) - alpha * ((R(t) - R_bar) / R_bar)
 * where alpha = sigma(G) / sigma(R) adaptively updated over a 2.0-second moving window.
 */

export interface GRDConfig {
  windowSeconds: number; // 2.0 seconds
  samplingRate: number;  // 120 Hz
}

export class GreenRedDifference {
  private capacity: number;
  private redBuffer: Float32Array;
  private greenBuffer: Float32Array;
  private writeIndex: number = 0;
  private count: number = 0;
  private isFilled: boolean = false;

  constructor(config: Partial<GRDConfig> = {}) {
    const windowSec = config.windowSeconds ?? 2.0;
    const fs = config.samplingRate ?? 120;
    this.capacity = Math.max(20, Math.round(windowSec * fs));
    this.redBuffer = new Float32Array(this.capacity);
    this.greenBuffer = new Float32Array(this.capacity);
  }

  public reset(): void {
    this.redBuffer.fill(0);
    this.greenBuffer.fill(0);
    this.writeIndex = 0;
    this.count = 0;
    this.isFilled = false;
  }

  /**
   * Pushes a raw (R, G) pair and returns the motion-suppressed pulsatile sample S_pulse(t).
   */
  public processSample(red: number, green: number): number {
    this.redBuffer[this.writeIndex] = red;
    this.greenBuffer[this.writeIndex] = green;

    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.count++;
    if (this.writeIndex === 0) {
      this.isFilled = true;
    }

    const currentLen = this.isFilled ? this.capacity : this.count;

    if (currentLen < 10) {
      // Warm-up period: fallback to zero-centered green
      return 0;
    }

    // Compute means (G_bar, R_bar)
    let sumG = 0;
    let sumR = 0;
    for (let i = 0; i < currentLen; i++) {
      sumG += this.greenBuffer[i];
      sumR += this.redBuffer[i];
    }
    const gBar = sumG / currentLen;
    const rBar = sumR / currentLen;

    if (gBar <= 1e-6 || rBar <= 1e-6) {
      return 0;
    }

    // Compute standard deviations sigma(G) and sigma(R)
    let varG = 0;
    let varR = 0;
    for (let i = 0; i < currentLen; i++) {
      const diffG = this.greenBuffer[i] - gBar;
      const diffR = this.redBuffer[i] - rBar;
      varG += diffG * diffG;
      varR += diffR * diffR;
    }
    const sigmaG = Math.sqrt(varG / currentLen);
    const sigmaR = Math.sqrt(varR / currentLen);

    // Adaptive alpha = sigma(G) / sigma(R)
    let alpha = 0;
    if (sigmaR > 1e-5) {
      alpha = sigmaG / sigmaR;
      // Clamp alpha to physiological reasonable boundary [0, 2.5] to prevent runaway noise amplification
      if (alpha > 2.5) alpha = 2.5;
    }

    const normG = (green - gBar) / gBar;
    const normR = (red - rBar) / rBar;

    const sPulse = normG - alpha * normR;
    return sPulse;
  }
}
