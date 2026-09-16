import { OximetryMetrics } from '../types';

export interface OximetryConfig {
  dpfRatio: number; // 0.65 DPF_G / DPF_R
  aCoeff: number;   // 110.0
  bCoeff: number;   // 25.0
  minSpo2: number;  // 85.0
  maxSpo2: number;  // 100.0
  windowSizeSamples: number; // typically 2-3 seconds of data (240-360 samples)
}

export const DEFAULT_OXIMETRY_CONFIG: OximetryConfig = {
  dpfRatio: 0.65,
  aCoeff: 110.0,
  bCoeff: 25.0,
  minSpo2: 85.0,
  maxSpo2: 100.0,
  windowSizeSamples: 240, // 2 seconds at 120 FPS
};

export class OximetryProxy {
  private config: OximetryConfig;
  private redHistory: Float32Array;
  private greenHistory: Float32Array;
  private historyIdx: number = 0;
  private sampleCount: number = 0;
  private lastValidSpo2: number = 98.0;

  constructor(config: Partial<OximetryConfig> = {}) {
    this.config = { ...DEFAULT_OXIMETRY_CONFIG, ...config };
    this.redHistory = new Float32Array(this.config.windowSizeSamples);
    this.greenHistory = new Float32Array(this.config.windowSizeSamples);
  }

  public reset(): void {
    this.redHistory.fill(0);
    this.greenHistory.fill(0);
    this.historyIdx = 0;
    this.sampleCount = 0;
    this.lastValidSpo2 = 98.0;
  }

  /**
   * Pushes latest (R, G) sample and computes reflectance-mode SpO2 proxy metrics.
   * @param isPressureStable Gating flag from ContactPressureGauge
   */
  public updateSample(red: number, green: number, isPressureStable: boolean): OximetryMetrics {
    this.redHistory[this.historyIdx] = red;
    this.greenHistory[this.historyIdx] = green;

    this.historyIdx = (this.historyIdx + 1) % this.config.windowSizeSamples;
    this.sampleCount = Math.min(this.sampleCount + 1, this.config.windowSizeSamples);

    const len = this.sampleCount;
    if (len < 20) {
      return {
        acGreen: 0,
        dcGreen: green,
        acRed: 0,
        dcRed: red,
        piGreen: 0,
        piRed: 0,
        ratioOfRatios: 1.0,
        spo2SurrogatePct: this.lastValidSpo2,
        isPressureStable,
        isCalibrated: false,
      };
    }

    // Compute DC (mean)
    let sumG = 0;
    let sumR = 0;
    for (let i = 0; i < len; i++) {
      sumG += this.greenHistory[i];
      sumR += this.redHistory[i];
    }
    const dcG = sumG / len;
    const dcR = sumR / len;

    // Compute AC (standard deviation)
    let varG = 0;
    let varR = 0;
    for (let i = 0; i < len; i++) {
      const diffG = this.greenHistory[i] - dcG;
      const diffR = this.redHistory[i] - dcR;
      varG += diffG * diffG;
      varR += diffR * diffR;
    }
    const acG = Math.sqrt(varG / len);
    const acR = Math.sqrt(varR / len);

    const piG = dcG > 0 ? (acG / dcG) * 100 : 0;
    const piR = dcR > 0 ? (acR / dcR) * 100 : 0;

    let ratioOfRatios = 1.0;
    if (piG > 0.01) {
      // Basic uncalibrated Ratio of Ratios
      ratioOfRatios = (piR / piG);
    }

    let rawSpo2 = this.config.aCoeff - this.config.bCoeff * ratioOfRatios;
    const clampedSpo2 = Math.min(this.config.maxSpo2, Math.max(this.config.minSpo2, rawSpo2));

    const isCalibrated = isPressureStable && piG >= 0.15 && len >= this.config.windowSizeSamples;

    if (isCalibrated) {
      // Smooth tracking towards new value
      this.lastValidSpo2 = 0.9 * this.lastValidSpo2 + 0.1 * clampedSpo2;
    }

    return {
      acGreen: Math.round(acG * 100) / 100,
      dcGreen: Math.round(dcG * 100) / 100,
      acRed: Math.round(acR * 100) / 100,
      dcRed: Math.round(dcR * 100) / 100,
      piGreen: Math.round(piG * 100) / 100,
      piRed: Math.round(piR * 100) / 100,
      ratioOfRatios: Math.round(ratioOfRatios * 1000) / 1000,
      spo2SurrogatePct: Math.round(this.lastValidSpo2 * 10) / 10,
      isPressureStable,
      isCalibrated,
    };
  }
}
