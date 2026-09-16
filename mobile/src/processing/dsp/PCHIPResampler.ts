/**
 * Piecewise Cubic Hermite Interpolating Polynomial (PCHIP) Resampler
 * Section 5.1 of METHODOLOGY.md
 *
 * Preserves shape and monotonicity without overshoot or false peaks.
 * Used to correct camera frame delivery micro-jitter onto an exact uniform 120.0 Hz grid,
 * and to resample IBI series onto uniform 4.0 Hz grid for spectral analysis.
 */

export class PCHIPResampler {
  /**
   * Evaluates PCHIP derivatives at all data nodes.
   */
  public static computeSlopes(x: Float64Array | number[], y: Float64Array | number[]): Float64Array {
    const n = x.length;
    const d = new Float64Array(n);
    if (n < 2) return d;
    if (n === 2) {
      const slope = (y[1] - y[0]) / (x[1] - x[0]);
      d[0] = slope;
      d[1] = slope;
      return d;
    }

    const h = new Float64Array(n - 1);
    const delta = new Float64Array(n - 1);

    for (let k = 0; k < n - 1; k++) {
      h[k] = x[k + 1] - x[k];
      if (h[k] <= 0) {
        // Enforce strictly positive delta x
        h[k] = 1e-6;
      }
      delta[k] = (y[k + 1] - y[k]) / h[k];
    }

    // Interior slopes: Fritsch-Carlson / Brodlie weighted harmonic mean
    for (let k = 1; k < n - 1; k++) {
      const d1 = delta[k - 1];
      const d2 = delta[k];
      if (d1 * d2 <= 0) {
        d[k] = 0;
      } else {
        const w1 = 2 * h[k] + h[k - 1];
        const w2 = h[k] + 2 * h[k - 1];
        d[k] = (w1 + w2) / (w1 / d1 + w2 / d2);
      }
    }

    // End points: Shape-preserving one-sided derivatives
    d[0] = ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1]);
    if (d[0] * delta[0] <= 0) {
      d[0] = 0;
    } else if (delta[0] * delta[1] < 0 && Math.abs(d[0]) > Math.abs(3 * delta[0])) {
      d[0] = 3 * delta[0];
    }

    const last = n - 1;
    d[last] = ((2 * h[last - 1] + h[last - 2]) * delta[last - 1] - h[last - 1] * delta[last - 2]) / (h[last - 1] + h[last - 2]);
    if (d[last] * delta[last - 1] <= 0) {
      d[last] = 0;
    } else if (delta[last - 1] * delta[last - 2] < 0 && Math.abs(d[last]) > Math.abs(3 * delta[last - 1])) {
      d[last] = 3 * delta[last - 1];
    }

    return d;
  }

  /**
   * Resamples unevenly spaced data (x, y) onto an exact uniform time grid with frequency targetFs.
   */
  public static resampleUniform(
    x: Float64Array | number[],
    y: Float64Array | number[],
    targetFs: number
  ): { times: Float64Array; values: Float64Array } {
    const n = x.length;
    if (n < 2) {
      return {
        times: new Float64Array(0),
        values: new Float64Array(0),
      };
    }

    const tStart = x[0];
    const tEnd = x[n - 1];
    const dt = 1.0 / targetFs;
    const totalSamples = Math.floor((tEnd - tStart) * targetFs) + 1;

    if (totalSamples <= 0) {
      return {
        times: new Float64Array(0),
        values: new Float64Array(0),
      };
    }

    const d = this.computeSlopes(x, y);
    const uniformTimes = new Float64Array(totalSamples);
    const uniformValues = new Float64Array(totalSamples);

    let currentInterval = 0;

    for (let i = 0; i < totalSamples; i++) {
      const t = tStart + i * dt;
      uniformTimes[i] = t;

      // Advance interval
      while (currentInterval < n - 2 && t > x[currentInterval + 1]) {
        currentInterval++;
      }

      const k = currentInterval;
      const xk = x[k];
      const xk1 = x[k + 1];
      const hk = Math.max(1e-6, xk1 - xk);
      const s = Math.min(Math.max(0, t - xk), hk);
      const u = s / hk;
      const u2 = u * u;
      const u3 = u2 * u;

      // Cubic Hermite basis
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;

      uniformValues[i] =
        h00 * y[k] +
        h10 * hk * d[k] +
        h01 * y[k + 1] +
        h11 * hk * d[k + 1];
    }

    return { times: uniformTimes, values: uniformValues };
  }
}
