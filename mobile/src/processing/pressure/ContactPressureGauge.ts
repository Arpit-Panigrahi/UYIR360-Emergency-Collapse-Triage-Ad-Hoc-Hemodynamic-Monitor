import { ContactPressureFeedback, ContactPressureState } from '../types';

export interface PressureGaugeConfig {
  samplingRate: number; // 120 Hz
  stabilityWindowMs: number; // 500 ms
  piOptimalThreshold: number; // 0.15 %
  piBlanchingThreshold: number; // 0.05 %
  dcBlanchingThreshold: number; // > 210 on 0-255 scale
  dcLowThreshold: number; // < 30 on 0-255 scale
  stabilityVarianceLimit: number; // 0.05 (5%)
}

export const DEFAULT_PRESSURE_CONFIG: PressureGaugeConfig = {
  samplingRate: 120,
  stabilityWindowMs: 500,
  piOptimalThreshold: 0.15,
  piBlanchingThreshold: 0.05,
  dcBlanchingThreshold: 210,
  dcLowThreshold: 30,
  stabilityVarianceLimit: 0.05,
};

export class ContactPressureGauge {
  private config: PressureGaugeConfig;
  private shortWindowLen: number; // 500ms
  private longWindowLen: number;  // 1.5s for AC/DC estimation
  private greenShortBuffer: Float32Array;
  private greenLongBuffer: Float32Array;
  private redLongBuffer: Float32Array;
  private shortIdx: number = 0;
  private longIdx: number = 0;
  private shortCount: number = 0;
  private longCount: number = 0;

  constructor(config: Partial<PressureGaugeConfig> = {}) {
    this.config = { ...DEFAULT_PRESSURE_CONFIG, ...config };
    this.shortWindowLen = Math.max(10, Math.round((this.config.stabilityWindowMs / 1000) * this.config.samplingRate));
    this.longWindowLen = Math.max(20, Math.round(1.5 * this.config.samplingRate));

    this.greenShortBuffer = new Float32Array(this.shortWindowLen);
    this.greenLongBuffer = new Float32Array(this.longWindowLen);
    this.redLongBuffer = new Float32Array(this.longWindowLen);
  }

  public reset(): void {
    this.greenShortBuffer.fill(0);
    this.greenLongBuffer.fill(0);
    this.redLongBuffer.fill(0);
    this.shortIdx = 0;
    this.longIdx = 0;
    this.shortCount = 0;
    this.longCount = 0;
  }

  public evaluateSample(red: number, green: number): ContactPressureFeedback {
    // Update short window (500 ms) for stability
    this.greenShortBuffer[this.shortIdx] = green;
    this.shortIdx = (this.shortIdx + 1) % this.shortWindowLen;
    this.shortCount = Math.min(this.shortCount + 1, this.shortWindowLen);

    // Update long window (1.5 s) for PI estimation
    this.greenLongBuffer[this.longIdx] = green;
    this.redLongBuffer[this.longIdx] = red;
    this.longIdx = (this.longIdx + 1) % this.longWindowLen;
    this.longCount = Math.min(this.longCount + 1, this.longWindowLen);

    // Compute stability over 500 ms
    let shortMin = Infinity;
    let shortMax = -Infinity;
    let shortSum = 0;
    for (let i = 0; i < this.shortCount; i++) {
      const g = this.greenShortBuffer[i];
      if (g < shortMin) shortMin = g;
      if (g > shortMax) shortMax = g;
      shortSum += g;
    }
    const shortMean = shortSum / (this.shortCount || 1);
    const deltaG = shortMax - shortMin;
    const deltaRatio = shortMean > 0 ? deltaG / shortMean : 1.0;
    const isStable = this.shortCount >= this.shortWindowLen && deltaRatio <= this.config.stabilityVarianceLimit;

    // Compute PI for Green and Red over 1.5 s
    let sumG = 0;
    let sumR = 0;
    for (let i = 0; i < this.longCount; i++) {
      sumG += this.greenLongBuffer[i];
      sumR += this.redLongBuffer[i];
    }
    const dcG = sumG / (this.longCount || 1);
    const dcR = sumR / (this.longCount || 1);

    let varG = 0;
    let varR = 0;
    for (let i = 0; i < this.longCount; i++) {
      const diffG = this.greenLongBuffer[i] - dcG;
      const diffR = this.redLongBuffer[i] - dcR;
      varG += diffG * diffG;
      varR += diffR * diffR;
    }
    const acG = Math.sqrt(varG / (this.longCount || 1));
    const acR = Math.sqrt(varR / (this.longCount || 1));

    const piG = dcG > 0 ? (acG / dcG) * 100 : 0;
    const piR = dcR > 0 ? (acR / dcR) * 100 : 0;

    let state: ContactPressureState;
    let message: string;
    let isOptimal = false;

    if (!isStable && this.shortCount >= this.shortWindowLen) {
      state = 'PRESSURE_UNSTABLE';
      message = 'Hold phone steady against skin';
    } else if (dcG > this.config.dcBlanchingThreshold && piG < this.config.piBlanchingThreshold) {
      // Blanching: tissue squashed, blood pushed out
      state = 'OVER_PRESSURE';
      message = 'Pressing too hard — loosen contact slightly';
    } else if (piG < this.config.piOptimalThreshold || dcG < this.config.dcLowThreshold) {
      // Under-pressure: poor optical coupling
      state = 'UNDER_PRESSURE';
      message = 'Press phone slightly firmer against skin';
    } else {
      // Optimal range
      state = 'OPTIMAL';
      message = 'Optimal contact detected';
      isOptimal = true;
    }

    return {
      state,
      perfusionIndexG: piG,
      perfusionIndexR: piR,
      meanGreen: dcG,
      deltaGreenVarianceRatio: deltaRatio,
      message,
      isOptimal,
      isStable,
    };
  }
}
