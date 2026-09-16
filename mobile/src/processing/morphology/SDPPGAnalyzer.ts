import { FiducialPoint, SDPPGComponents } from '../types';
import { RawBeatCycle } from '../cardio/FiducialDetector';

export class SDPPGAnalyzer {
  /**
   * Extracts the 5 classic fiducial points (a, b, c, d, e) on the SDPPG signal within a beat cycle.
   */
  public static analyzeCycle(
    beat: RawBeatCycle,
    times: Float64Array,
    sdppgSignal: Float64Array
  ): SDPPGComponents | null {
    const startIdx = beat.sampleIndices.footIdx;
    const peakIdx = beat.sampleIndices.peakIdx;
    const endIdx = beat.sampleIndices.endIdx;

    if (peakIdx - startIdx < 4 || endIdx - peakIdx < 4) {
      return null;
    }

    // Step 1: Find a-wave (initial positive acceleration crest on systolic upstroke)
    let aIdx = startIdx;
    let maxA = -Infinity;
    for (let i = startIdx; i <= peakIdx; i++) {
      if (sdppgSignal[i] > maxA) {
        maxA = sdppgSignal[i];
        aIdx = i;
      }
    }

    if (maxA <= 0 || aIdx >= peakIdx) {
      return null;
    }

    const aPoint: FiducialPoint = {
      index: aIdx,
      time: times[aIdx],
      value: maxA,
    };

    // Step 2: Find b-wave (deepest deceleration trough following a-wave)
    let bIdx = aIdx;
    let minB = Infinity;
    const bSearchLimit = Math.min(endIdx, peakIdx + Math.round((peakIdx - startIdx) * 0.8));
    for (let i = aIdx + 1; i <= bSearchLimit; i++) {
      if (sdppgSignal[i] < minB) {
        minB = sdppgSignal[i];
        bIdx = i;
      }
    }

    const bPoint: FiducialPoint = {
      index: bIdx,
      time: times[bIdx],
      value: minB,
    };

    // Step 3: Find c-wave (local re-acceleration peak following b-wave)
    let cIdx = bIdx;
    let maxC = -Infinity;
    const cSearchLimit = Math.min(endIdx, bIdx + Math.round((endIdx - bIdx) * 0.45));
    for (let i = bIdx + 1; i <= cSearchLimit; i++) {
      if (sdppgSignal[i] > maxC) {
        maxC = sdppgSignal[i];
        cIdx = i;
      }
    }

    const cPoint: FiducialPoint = {
      index: cIdx,
      time: times[cIdx],
      value: maxC,
    };

    // Step 4: Find d-wave (local deceleration trough following c-wave)
    let dIdx = cIdx;
    let minD = Infinity;
    const dSearchLimit = Math.min(endIdx, cIdx + Math.round((endIdx - cIdx) * 0.5));
    for (let i = cIdx + 1; i <= dSearchLimit; i++) {
      if (sdppgSignal[i] < minD) {
        minD = sdppgSignal[i];
        dIdx = i;
      }
    }

    const dPoint: FiducialPoint = {
      index: dIdx,
      time: times[dIdx],
      value: minD,
    };

    // Step 5: Find e-wave (dicrotic notch positive acceleration rebound)
    let eIdx = dIdx;
    let maxE = -Infinity;
    for (let i = dIdx + 1; i <= endIdx; i++) {
      if (sdppgSignal[i] > maxE) {
        maxE = sdppgSignal[i];
        eIdx = i;
      }
    }

    const ePoint: FiducialPoint = {
      index: eIdx,
      time: times[eIdx],
      value: maxE,
    };

    // Clinical Indices:
    // AGI = (b - c - d - e) / a
    const aVal = aPoint.value;
    const bVal = bPoint.value;
    const cVal = cPoint.value;
    const dVal = dPoint.value;
    const eVal = ePoint.value;

    const agingIndex = aVal !== 0 ? (bVal - cVal - dVal - eVal) / aVal : 0;
    const baRatio = aVal !== 0 ? bVal / aVal : 0;

    return {
      a: aPoint,
      b: bPoint,
      c: cPoint,
      d: dPoint,
      e: ePoint,
      agingIndex: Math.round(agingIndex * 1000) / 1000,
      baRatio: Math.round(baRatio * 1000) / 1000,
      crestTimeMs: Math.round(beat.crestTimeMs * 10) / 10,
    };
  }
}
