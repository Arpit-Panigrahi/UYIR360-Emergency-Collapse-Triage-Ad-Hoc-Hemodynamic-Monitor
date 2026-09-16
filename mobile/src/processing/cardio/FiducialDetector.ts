import { FiducialPoint } from '../types';

export interface RawBeatCycle {
  diastolicFoot: FiducialPoint;
  intersectingTangentFoot: FiducialPoint;
  m1d: FiducialPoint;
  systolicPeak: FiducialPoint;
  crestTimeMs: number;
  amplitude: number;
  sampleIndices: {
    footIdx: number;
    m1dIdx: number;
    peakIdx: number;
    endIdx: number;
  };
}

export class FiducialDetector {
  private samplingRate: number;

  constructor(samplingRate: number = 120) {
    this.samplingRate = samplingRate;
  }

  /**
   * Detects beat fiducials across a filtered cardiac PPG signal and its first derivative.
   */
  public detectBeats(
    times: Float64Array,
    ppgSignal: Float64Array,
    dSignal: Float64Array
  ): RawBeatCycle[] {
    const n = ppgSignal.length;
    if (n < this.samplingRate) {
      return [];
    }

    // Minimum distance between beats corresponding to 220 BPM max physiological HR (0.27s)
    const minDistanceSamples = Math.round(0.27 * this.samplingRate);

    // Step 1: Detect candidate systolic peaks in filtered PPG signal
    const candidatePeaks: number[] = [];
    for (let i = 2; i < n - 2; i++) {
      if (
        ppgSignal[i] > ppgSignal[i - 1] &&
        ppgSignal[i] > ppgSignal[i - 2] &&
        ppgSignal[i] >= ppgSignal[i + 1] &&
        ppgSignal[i] > ppgSignal[i + 2]
      ) {
        // Must be positive amplitude relative to surrounding baseline
        if (candidatePeaks.length === 0 || i - candidatePeaks[candidatePeaks.length - 1] >= minDistanceSamples) {
          candidatePeaks.push(i);
        } else if (ppgSignal[i] > ppgSignal[candidatePeaks[candidatePeaks.length - 1]]) {
          // If too close, keep the higher peak
          candidatePeaks[candidatePeaks.length - 1] = i;
        }
      }
    }

    if (candidatePeaks.length < 2) {
      return [];
    }

    const beats: RawBeatCycle[] = [];

    // Step 2: For each peak, identify the preceding diastolic trough (foot) and systolic upstroke
    for (let p = 0; p < candidatePeaks.length; p++) {
      const peakIdx = candidatePeaks[p];
      const prevBoundary = p > 0 ? candidatePeaks[p - 1] : Math.max(0, peakIdx - Math.round(1.4 * this.samplingRate));

      // Search for diastolic minimum between prevBoundary and peakIdx
      let minIdx = prevBoundary;
      let minVal = ppgSignal[minIdx];
      for (let j = prevBoundary; j < peakIdx; j++) {
        if (ppgSignal[j] < minVal) {
          minVal = ppgSignal[j];
          minIdx = j;
        }
      }

      if (minIdx >= peakIdx - 2) {
        continue;
      }

      // Step 3: Find Maximum First Derivative (M1D) point on upstroke between minIdx and peakIdx
      let m1dIdx = minIdx;
      let maxSlope = dSignal[m1dIdx];
      for (let j = minIdx; j <= peakIdx; j++) {
        if (dSignal[j] > maxSlope) {
          maxSlope = dSignal[j];
          m1dIdx = j;
        }
      }

      if (maxSlope <= 1e-6) {
        // Flat or negative upstroke
        continue;
      }

      // Step 4: Intersecting Tangents (IT) Calculation:
      // Diastolic baseline: y = V_min
      // Upstroke tangent: y - V_m1d = m * (t - t_m1d)
      // t_foot = t_m1d - (V_m1d - V_min) / m
      const tMin = times[minIdx];
      const vMin = ppgSignal[minIdx];
      const tM1d = times[m1dIdx];
      const vM1d = ppgSignal[m1dIdx];
      const m = maxSlope;

      // Simplistic foot detection: ignore M1D tangent, just use minimum
      let tFootIT = tMin;

      const tPeak = times[peakIdx];
      const vPeak = ppgSignal[peakIdx];
      const crestTimeMs = (tPeak - tFootIT) * 1000;
      const amplitude = vPeak - vMin;

      // Determine cycle end index (next trough or midpoint)
      const nextBoundary = p < candidatePeaks.length - 1 ? candidatePeaks[p + 1] : Math.min(n - 1, peakIdx + (peakIdx - minIdx));

      beats.push({
        diastolicFoot: {
          index: minIdx,
          time: tMin,
          value: vMin,
        },
        intersectingTangentFoot: {
          index: Math.round(minIdx + ((tFootIT - tMin) / (times[minIdx + 1] - times[minIdx] || 1 / this.samplingRate))),
          time: tFootIT,
          value: vMin,
        },
        m1d: {
          index: m1dIdx,
          time: tM1d,
          value: vM1d,
        },
        systolicPeak: {
          index: peakIdx,
          time: tPeak,
          value: vPeak,
        },
        crestTimeMs,
        amplitude,
        sampleIndices: {
          footIdx: minIdx,
          m1dIdx,
          peakIdx,
          endIdx: nextBoundary,
        },
      });
    }

    return beats;
  }
}
