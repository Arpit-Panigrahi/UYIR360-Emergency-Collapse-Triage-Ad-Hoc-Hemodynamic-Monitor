import FFT from 'fft.js';
import * as ss from 'simple-statistics';
import { PCHIPResampler } from '../dsp/PCHIPResampler';
import { PRVFrequencyDomainMetrics, PRVMetrics, PRVNonLinearMetrics, PRVTimeDomainMetrics } from '../types';

export class PRVAnalyzer {
  /**
   * Computes comprehensive time-domain, frequency-domain, and non-linear PRV/HRV metrics.
   * @param nnIntervalsSec Array of valid NN intervals in seconds
   * @param nnTimestampsSec Timestamps of the beats in seconds
   */
  public static computePRVMetrics(
    nnIntervalsSec: number[],
    nnTimestampsSec: number[]
  ): PRVMetrics | null {
    if (nnIntervalsSec.length < 5) {
      return null;
    }

    const timeDomain = this.computeTimeDomain(nnIntervalsSec);
    const nonLinear = this.computeNonLinear(nnIntervalsSec, timeDomain.sdnnMs);
    const frequencyDomain = this.computeFrequencyDomain(nnIntervalsSec, nnTimestampsSec);

    return {
      timeDomain,
      frequencyDomain,
      nonLinear,
    };
  }

  public static computeTimeDomain(nnIntervalsSec: number[]): PRVTimeDomainMetrics {
    const n = nnIntervalsSec.length;
    const hrValues = nnIntervalsSec.map((ibi) => 60.0 / ibi);

    const meanHR = ss.mean(hrValues);
    const medianHR = ss.median(hrValues);

    const intervalsMs = nnIntervalsSec.map((ibi) => ibi * 1000);
    const sdnnMs = ss.standardDeviation(intervalsMs);

    // RMSSD & pNN50
    let sumDiffSq = 0;
    let count50 = 0;
    const diffCount = n - 1;

    for (let i = 0; i < diffCount; i++) {
      const diffMs = Math.abs(intervalsMs[i + 1] - intervalsMs[i]);
      sumDiffSq += diffMs * diffMs;
      if (diffMs > 50) {
        count50++;
      }
    }

    const rmssdMs = diffCount > 0 ? Math.sqrt(sumDiffSq / diffCount) : 0;
    const pnn50Pct = diffCount > 0 ? (count50 / diffCount) * 100 : 0;

    return {
      meanHrBpm: Math.round(meanHR * 10) / 10,
      medianHrBpm: Math.round(medianHR * 10) / 10,
      sdnnMs: Math.round(sdnnMs * 10) / 10,
      rmssdMs: Math.round(rmssdMs * 10) / 10,
      pnn50Pct: Math.round(pnn50Pct * 10) / 10,
      validIntervalsCount: n,
    };
  }

  public static computeNonLinear(
    nnIntervalsSec: number[],
    sdnnMs: number
  ): PRVNonLinearMetrics {
    const n = nnIntervalsSec.length;
    if (n < 3) {
      return { sd1Ms: 0, sd2Ms: 0, sd1Sd2Ratio: 0 };
    }

    const intervalsMs = nnIntervalsSec.map((s) => s * 1000);
    const diffs: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      diffs.push(intervalsMs[i] - intervalsMs[i + 1]);
    }

    const varDiff = ss.variance(diffs);
    // SD1 = sqrt(0.5 * Var(x_n - x_{n+1}))
    const sd1Ms = Math.sqrt(0.5 * varDiff);

    // SD2 = sqrt(2 * SDNN^2 - 0.5 * SD1^2)
    const sd2Term = 2 * (sdnnMs * sdnnMs) - 0.5 * (sd1Ms * sd1Ms);
    const sd2Ms = sd2Term > 0 ? Math.sqrt(sd2Term) : 0;
    const sd1Sd2Ratio = sd2Ms > 0 ? sd1Ms / sd2Ms : 0;

    return {
      sd1Ms: Math.round(sd1Ms * 10) / 10,
      sd2Ms: Math.round(sd2Ms * 10) / 10,
      sd1Sd2Ratio: Math.round(sd1Sd2Ratio * 100) / 100,
    };
  }

  public static computeFrequencyDomain(
    nnIntervalsSec: number[],
    nnTimestampsSec: number[]
  ): PRVFrequencyDomainMetrics {
    const fallback: PRVFrequencyDomainMetrics = {
      vlfPower: 0,
      lfPower: 0,
      hfPower: 0,
      lfHfRatio: 0,
      lfNormalizedUnits: 0,
      hfNormalizedUnits: 0,
      totalPower: 0,
    };

    if (nnIntervalsSec.length < 10 || nnTimestampsSec.length < 10) {
      return fallback;
    }

    // Step 1: Resample valid IBI series onto uniform 4.0 Hz grid using PCHIP
    const targetFs = 4.0;
    const { times, values } = PCHIPResampler.resampleUniform(
      nnTimestampsSec,
      nnIntervalsSec.map((v) => v * 1000), // convert to ms
      targetFs
    );

    const n = values.length;
    if (n < 32) {
      return fallback;
    }

    // Zero-mean the resampled series
    const meanVal = ss.mean(Array.from(values));
    const zeroMeanValues = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      zeroMeanValues[i] = values[i] - meanVal;
    }

    // Next power of 2 for FFT
    const segmentLength = Math.min(256, 1 << Math.floor(Math.log2(n)));
    const fftInstance = new FFT(segmentLength);
    const window = new Float64Array(segmentLength);

    // Hanning window
    let windowSumSq = 0;
    for (let i = 0; i < segmentLength; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (segmentLength - 1)));
      window[i] = w;
      windowSumSq += w * w;
    }

    const step = Math.max(1, Math.floor(segmentLength / 2)); // 50% overlap
    const halfLen = segmentLength / 2;
    const psdAccum = new Float64Array(halfLen + 1);
    let numWindows = 0;

    const segment = new Array(segmentLength);
    const complexOut = fftInstance.createComplexArray();

    for (let start = 0; start + segmentLength <= n; start += step) {
      for (let i = 0; i < segmentLength; i++) {
        segment[i] = zeroMeanValues[start + i] * window[i];
      }

      fftInstance.realTransform(complexOut, segment);

      // Compute power: |X[k]|^2 / (Fs * sum(w^2))
      for (let k = 0; k <= halfLen; k++) {
        const re = complexOut[2 * k];
        const im = complexOut[2 * k + 1];
        const magSq = re * re + im * im;
        const scale = (k === 0 || k === halfLen) ? 1.0 : 2.0;
        psdAccum[k] += (scale * magSq) / (targetFs * windowSumSq);
      }
      numWindows++;
    }

    if (numWindows === 0) return fallback;

    const df = targetFs / segmentLength;
    let vlfPower = 0;
    let lfPower = 0;
    let hfPower = 0;

    for (let k = 0; k <= halfLen; k++) {
      const freq = k * df;
      const psdVal = psdAccum[k] / numWindows;

      if (freq >= 0.0033 && freq < 0.04) {
        vlfPower += psdVal * df;
      } else if (freq >= 0.04 && freq < 0.15) {
        lfPower += psdVal * df;
      } else if (freq >= 0.15 && freq <= 0.40) {
        hfPower += psdVal * df;
      }
    }

    const totalPower = vlfPower + lfPower + hfPower;
    const lfHfSum = lfPower + hfPower;
    const lfNormalizedUnits = lfHfSum > 0 ? (lfPower / lfHfSum) * 100 : 0;
    const hfNormalizedUnits = lfHfSum > 0 ? (hfPower / lfHfSum) * 100 : 0;
    const lfHfRatio = hfPower > 0 ? lfPower / hfPower : 0;

    return {
      vlfPower: Math.round(vlfPower * 10) / 10,
      lfPower: Math.round(lfPower * 10) / 10,
      hfPower: Math.round(hfPower * 10) / 10,
      lfHfRatio: Math.round(lfHfRatio * 100) / 100,
      lfNormalizedUnits: Math.round(lfNormalizedUnits * 10) / 10,
      hfNormalizedUnits: Math.round(hfNormalizedUnits * 10) / 10,
      totalPower: Math.round(totalPower * 10) / 10,
    };
  }
}
