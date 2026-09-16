import Fili from 'fili';

export interface FilterOptions {
  samplingRate: number; // default 120 Hz
  cardiacLowCutoff: number; // 0.75 Hz (45 BPM)
  cardiacHighCutoff: number; // 3.5 Hz (210 BPM)
  respirationLowCutoff: number; // 0.1 Hz (6 BrPM)
  respirationHighCutoff: number; // 0.4 Hz (24 BrPM)
}

export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  samplingRate: 120,
  cardiacLowCutoff: 0.75,
  cardiacHighCutoff: 3.5,
  respirationLowCutoff: 0.1,
  respirationHighCutoff: 0.4,
};

export class ButterworthFilter {
  private options: FilterOptions;
  private cardiacCoeffs: any;
  private respirationCoeffs: any;

  constructor(options: Partial<FilterOptions> = {}) {
    this.options = { ...DEFAULT_FILTER_OPTIONS, ...options };
    const iirCalc = new Fili.CalcCascades();

    // 4th order zero-phase is achieved by running 2nd order forward and backward
    const cardiacCenter = (this.options.cardiacHighCutoff + this.options.cardiacLowCutoff) / 2;
    const cardiacBW = this.options.cardiacHighCutoff - this.options.cardiacLowCutoff;

    this.cardiacCoeffs = iirCalc.bandpass({
      order: 2,
      characteristic: 'butterworth',
      Fs: this.options.samplingRate,
      Fc: cardiacCenter,
      BW: cardiacBW,
    });

    const respCenter = (this.options.respirationHighCutoff + this.options.respirationLowCutoff) / 2;
    const respBW = this.options.respirationHighCutoff - this.options.respirationLowCutoff;

    // 3rd order Butterworth
    this.respirationCoeffs = iirCalc.bandpass({
      order: 2,
      characteristic: 'butterworth',
      Fs: this.options.samplingRate,
      Fc: respCenter,
      BW: respBW,
    });
  }

  /**
   * Applies zero-phase forward-backward filtering (filtfilt) for cardiac bandpass (0.75 - 3.5 Hz).
   */
  public filterCardiacFiltfilt(signal: Float64Array | number[]): Float64Array {
    return this.filtfilt(signal, this.cardiacCoeffs);
  }

  /**
   * Applies zero-phase forward-backward filtering (filtfilt) for respiratory baseline wander (0.1 - 0.4 Hz).
   */
  public filterRespirationFiltfilt(signal: Float64Array | number[]): Float64Array {
    return this.filtfilt(signal, this.respirationCoeffs);
  }

  private filtfilt(signal: Float64Array | number[], coeffs: any): Float64Array {
    const len = signal.length;
    if (len === 0) return new Float64Array(0);
    if (len < 12) {
      // Short array: return copy
      const copy = new Float64Array(len);
      for (let i = 0; i < len; i++) copy[i] = signal[i];
      return copy;
    }

    // Forward pass
    const forwardFilter = new Fili.IirFilter(coeffs);
    const forwardOutput = forwardFilter.multiStep(Array.from(signal));

    // Reverse array
    const reversed = forwardOutput.reverse();

    // Backward pass
    const backwardFilter = new Fili.IirFilter(coeffs);
    const backwardOutput = backwardFilter.multiStep(reversed);

    // Reverse back
    const finalOutput = backwardOutput.reverse();
    return new Float64Array(finalOutput);
  }

  /**
   * Computes the 1st derivative (velocity) G'(t) using a 5-point central stencil.
   */
  public static computeFirstDerivative(signal: Float64Array | number[], fs: number): Float64Array {
    const n = signal.length;
    const out = new Float64Array(n);
    if (n < 5) return out;

    const dt = 1.0 / fs;
    const factor = 1.0 / (12.0 * dt);

    // Boundary points (forward/backward differences)
    out[0] = (signal[1] - signal[0]) / dt;
    out[1] = (signal[2] - signal[0]) / (2 * dt);

    for (let i = 2; i < n - 2; i++) {
      out[i] = (-signal[i + 2] + 8 * signal[i + 1] - 8 * signal[i - 1] + signal[i - 2]) * factor;
    }

    out[n - 2] = (signal[n - 1] - signal[n - 3]) / (2 * dt);
    out[n - 1] = (signal[n - 1] - signal[n - 2]) / dt;

    return out;
  }

  /**
   * Computes the 2nd derivative (acceleration / SDPPG) G''(t) * fs^2 using a 5-point stencil.
   */
  public static computeSecondDerivative(signal: Float64Array | number[], fs: number): Float64Array {
    const n = signal.length;
    const out = new Float64Array(n);
    if (n < 5) return out;

    const dt = 1.0 / fs;
    // Multiplied by fs^2 as specified in Section 6 of METHODOLOGY: SDPPG(t) = d^2/dt^2 G(t) * fs^2
    const factor = (fs * fs) / (12.0 * dt * dt);

    out[0] = ((signal[2] - 2 * signal[1] + signal[0]) / (dt * dt)) * (fs * fs);
    out[1] = ((signal[2] - 2 * signal[1] + signal[0]) / (dt * dt)) * (fs * fs);

    for (let i = 2; i < n - 2; i++) {
      out[i] = (-signal[i + 2] + 16 * signal[i + 1] - 30 * signal[i] + 16 * signal[i - 1] - signal[i - 2]) * factor;
    }

    out[n - 2] = ((signal[n - 1] - 2 * signal[n - 2] + signal[n - 3]) / (dt * dt)) * (fs * fs);
    out[n - 1] = ((signal[n - 1] - 2 * signal[n - 2] + signal[n - 3]) / (dt * dt)) * (fs * fs);

    return out;
  }
}
