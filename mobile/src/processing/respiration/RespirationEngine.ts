import FFT from 'fft.js';

export class RespirationEngine {
  constructor() {}

  /**
   * Processes a bandpassed signal using FFT to find the dominant respiratory frequency.
   * Matches python baseline RR extraction.
   */
  public processBatch(signal: Float64Array, fs: number): number {
    const n = signal.length;
    if (n < 32) return 15.0; // fallback

    // Find next power of 2 for FFT
    let size = 1;
    while (size < n) size *= 2;
    // We can just use the first 'size' samples or pad with zero
    // Padding with zero
    const padded = new Array(size).fill(0);
    for (let i = 0; i < n; i++) padded[i] = signal[i];

    const f = new FFT(size);
    const out = f.createComplexArray();
    f.realTransform(out, padded);

    let maxPower = -1;
    let maxIdx = -1;
    // Search between 0.1 and 0.5 Hz
    const minIdx = Math.floor((0.1 * size) / fs);
    const maxIdxSearch = Math.ceil((0.5 * size) / fs);

    for (let i = minIdx; i <= maxIdxSearch; i++) {
      const real = out[2 * i];
      const imag = out[2 * i + 1];
      const power = real * real + imag * imag;
      if (power > maxPower) {
        maxPower = power;
        maxIdx = i;
      }
    }

    if (maxIdx === -1) return 15.0; // fallback

    const freqHz = (maxIdx * fs) / size;
    return freqHz * 60.0;
  }
}
