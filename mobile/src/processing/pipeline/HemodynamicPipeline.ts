import { ButterworthFilter } from '../dsp/ButterworthFilter';
import { PCHIPResampler } from '../dsp/PCHIPResampler';
import { FiducialDetector, RawBeatCycle } from '../cardio/FiducialDetector';
import { PRVAnalyzer } from '../cardio/PRVAnalyzer';
import { SQIProtocol } from '../cardio/SQIProtocol';
import { OximetryProxy } from '../hemodynamics/OximetryProxy';
import { SDPPGAnalyzer } from '../morphology/SDPPGAnalyzer';
import { ContactPressureGauge } from '../pressure/ContactPressureGauge';
import { RespirationEngine } from '../respiration/RespirationEngine';
import { POSProjection } from '../spatial/POS';
import { OptROIS } from '../spatial/OptROIS';
import { TriageEngine } from '../triage/TriageEngine';
import {
  CardiacCycle,
  ContactPressureFeedback,
  HemodynamicSnapshot,
  OximetryMetrics,
  PRVMetrics,
  RawOpticalSample,
  RespirationResult,
  SDPPGComponents,
  TriageStatus,
} from '../types';

export interface PipelineConfig {
  samplingRate: number; // 120 Hz
  bufferCapacitySamples: number; // 10800 (~90s at 120 FPS, ~86KB)
  analysisIntervalSamples: number; // run heavy metrics every 15-30 samples (e.g. 4-8 times per second)
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  samplingRate: 120,
  bufferCapacitySamples: 10800,
  analysisIntervalSamples: 24, // every 200 ms
};

export type SampleCallback = (snapshot: {
  timestamp: number;
  filteredPPG: number;
  instantaneousHR: number;
  pressure: ContactPressureFeedback;
}) => void;

export type BeatCallback = (cycle: CardiacCycle) => void;
export type TelemetryCallback = (telemetry: HemodynamicSnapshot) => void;
export type EmergencyCallback = (triage: TriageStatus) => void;

export class HemodynamicPipeline {
  private config: PipelineConfig;
  private optRois: OptROIS;
  private pos: POSProjection;
  private pressureGauge: ContactPressureGauge;
  private butterworth: ButterworthFilter;
  private fiducialDetector: FiducialDetector;
  private sqiProtocol: SQIProtocol;
  private respirationEngine: RespirationEngine;
  private oximetryProxy: OximetryProxy;
  private triageEngine: TriageEngine;

  // Ring buffers for zero-allocation streaming
  private rawTimes: Float64Array;
  private rawReds: Float32Array;
  private rawGreens: Float32Array;
  private rawBlues: Float32Array;
  private posPulses: Float32Array;
  private headIdx: number = 0;
  private totalSamplesPushed: number = 0;
  private startTimestamp: number | null = null;

  // Beat history
  private validNnIntervals: number[] = [];
  private validNnTimes: number[] = [];
  private lastDetectedFootTime: number = 0;
  private latestCycle?: CardiacCycle;
  private latestPrv?: PRVMetrics;
  private latestSdppg?: SDPPGComponents;
  private latestRespiration?: RespirationResult;
  private latestOximetry!: OximetryMetrics;
  private latestTriage!: TriageStatus;

  // Listeners
  private onSampleListeners: SampleCallback[] = [];
  private onBeatListeners: BeatCallback[] = [];
  private onTelemetryListeners: TelemetryCallback[] = [];
  private onEmergencyListeners: EmergencyCallback[] = [];

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    const fs = this.config.samplingRate;

    this.optRois = new OptROIS({ samplingRate: fs });
    this.pos = new POSProjection({ samplingRate: fs });
    this.pressureGauge = new ContactPressureGauge({ samplingRate: fs });
    this.butterworth = new ButterworthFilter({ samplingRate: fs });
    this.fiducialDetector = new FiducialDetector(fs);
    this.sqiProtocol = new SQIProtocol(100);
    this.respirationEngine = new RespirationEngine();
    this.oximetryProxy = new OximetryProxy();
    this.triageEngine = new TriageEngine();

    const cap = this.config.bufferCapacitySamples;
    this.rawTimes = new Float64Array(cap);
    this.rawReds = new Float32Array(cap);
    this.rawGreens = new Float32Array(cap);
    this.rawBlues = new Float32Array(cap);
    this.posPulses = new Float32Array(cap);

    this.reset();
  }

  public reset(): void {
    this.optRois.reset();
    this.pos.reset();
    this.pressureGauge.reset();
    this.sqiProtocol.reset();
    this.oximetryProxy.reset();
    this.triageEngine.reset();

    this.rawTimes.fill(0);
    this.rawReds.fill(0);
    this.rawGreens.fill(0);
    this.rawBlues.fill(0);
    this.posPulses.fill(0);

    this.headIdx = 0;
    this.totalSamplesPushed = 0;
    this.startTimestamp = null;
    this.validNnIntervals = [];
    this.validNnTimes = [];
    this.lastDetectedFootTime = 0;
    this.latestCycle = undefined;
    this.latestPrv = undefined;
    this.latestSdppg = undefined;
    this.latestRespiration = undefined;
  }

  public subscribeSample(cb: SampleCallback): () => void {
    this.onSampleListeners.push(cb);
    return () => {
      this.onSampleListeners = this.onSampleListeners.filter((l) => l !== cb);
    };
  }

  public subscribeBeat(cb: BeatCallback): () => void {
    this.onBeatListeners.push(cb);
    return () => {
      this.onBeatListeners = this.onBeatListeners.filter((l) => l !== cb);
    };
  }

  public subscribeTelemetry(cb: TelemetryCallback): () => void {
    this.onTelemetryListeners.push(cb);
    return () => {
      this.onTelemetryListeners = this.onTelemetryListeners.filter((l) => l !== cb);
    };
  }

  public subscribeEmergency(cb: EmergencyCallback): () => void {
    this.onEmergencyListeners.push(cb);
    return () => {
      this.onEmergencyListeners = this.onEmergencyListeners.filter((l) => l !== cb);
    };
  }

  /**
   * Push camera frame pixel buffer through OptROIS into pipeline.
   */
  public pushFramePixels(
    pixels: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    timestampSec: number,
    isBGRA: boolean = false
  ): void {
    const sample = this.optRois.processFramePixels(pixels, width, height, timestampSec, isBGRA);
    this.pushSample(sample);
  }

  /**
   * Ingest a single raw optical sample (t, R, G, B).
   */
  public pushSample(sample: RawOpticalSample): void {
    const t = sample.timestamp;
    if (this.startTimestamp === null) {
      this.startTimestamp = t;
    }

    const elapsed = t - this.startTimestamp;
    const writeIdx = this.headIdx;

    this.rawTimes[writeIdx] = t;
    this.rawReds[writeIdx] = sample.red;
    this.rawGreens[writeIdx] = sample.green;
    this.rawBlues[writeIdx] = sample.blue;

    // POS motion suppression
    const posPulse = this.pos.processSample(sample.red, sample.green, sample.blue);
    this.posPulses[writeIdx] = posPulse;

    // Contact pressure evaluation
    const pressure = this.pressureGauge.evaluateSample(sample.red, sample.green);

    // Oximetry proxy update
    this.latestOximetry = this.oximetryProxy.updateSample(sample.red, sample.green, pressure.isStable);

    this.headIdx = (this.headIdx + 1) % this.config.bufferCapacitySamples;
    this.totalSamplesPushed++;

    // Notify lightweight sample listeners
    const instantHR = this.latestCycle ? this.latestCycle.instantaneousHrBpm : 0;
    for (const listener of this.onSampleListeners) {
      listener({
        timestamp: t,
        filteredPPG: posPulse,
        instantaneousHR: instantHR,
        pressure,
      });
    }

    // Run periodic batch processing (filtering, fiducials, SQI, PRV, SDPPG, Respiration, Triage)
    if (this.totalSamplesPushed % this.config.analysisIntervalSamples === 0) {
      this.runBatchAnalysis(t, elapsed, sample, posPulse, pressure);
    }
  }

  private runBatchAnalysis(
    timestamp: number,
    elapsed: number,
    latestRaw: RawOpticalSample,
    posPulse: number,
    pressure: ContactPressureFeedback
  ): void {
    const cap = this.config.bufferCapacitySamples;
    const count = Math.min(this.totalSamplesPushed, cap);
    const fs = this.config.samplingRate;

    // We need at least 1.5 seconds of data to run filtering and fiducial detection
    if (count < Math.round(1.5 * fs)) {
      this.latestTriage = this.triageEngine.evaluate(elapsed, pressure, null, null, false);
      return;
    }

    const windowLength = Math.min(count, Math.round(30.0 * fs));
    const winTimes = new Float64Array(windowLength);
    const winPOS = new Float64Array(windowLength);
    const winGreen = new Float64Array(windowLength);

    for (let i = 0; i < windowLength; i++) {
      const ringIdx = (this.headIdx - windowLength + i + cap) % cap;
      winTimes[i] = this.rawTimes[ringIdx];
      winPOS[i] = this.posPulses[ringIdx];
      winGreen[i] = this.rawGreens[ringIdx];
    }

    // Step 1: PCHIP uniform resampling to remove frame delivery micro-jitter
    const { times: uniformTimes, values: uniformPOS } = PCHIPResampler.resampleUniform(
      winTimes,
      winPOS,
      fs
    );

    if (uniformTimes.length < Math.round(1.2 * fs)) {
      return;
    }

    // Python Detrend implementation (linear detrend approximation)
    // Mean centering is the standard online approximation for detrend
    let meanPOS = 0;
    for (let i = 0; i < uniformPOS.length; i++) {
      meanPOS += uniformPOS[i];
    }
    meanPOS /= uniformPOS.length;
    for (let i = 0; i < uniformPOS.length; i++) {
      uniformPOS[i] -= meanPOS;
    }

    // Step 2: Zero-phase Butterworth bandpass filter for cardiac PPG (0.75 - 3.5 Hz)
    let filteredPPG = this.butterworth.filterCardiacFiltfilt(uniformPOS);

    // Python Normalization (mean=0, std=1)
    let sumFiltered = 0;
    for (let i = 0; i < filteredPPG.length; i++) sumFiltered += filteredPPG[i];
    let meanFiltered = sumFiltered / filteredPPG.length;
    let varFiltered = 0;
    for (let i = 0; i < filteredPPG.length; i++) varFiltered += (filteredPPG[i] - meanFiltered) * (filteredPPG[i] - meanFiltered);
    let stdFiltered = Math.sqrt(varFiltered / filteredPPG.length);
    if (stdFiltered > 1e-6) {
      for (let i = 0; i < filteredPPG.length; i++) filteredPPG[i] = (filteredPPG[i] - meanFiltered) / stdFiltered;
    }

    // Step 3: Compute 1st and 2nd derivatives
    const dPPG = ButterworthFilter.computeFirstDerivative(filteredPPG, fs);
    const sdppg = ButterworthFilter.computeSecondDerivative(filteredPPG, fs);

    // Step 4: Detect fiducials (IT foot, M1D, peak)
    const beats: RawBeatCycle[] = this.fiducialDetector.detectBeats(uniformTimes, filteredPPG, dPPG);

    // Step 5: Process detected beats through SQI protocol
    let prevIbi: number | null = this.validNnIntervals.length > 0 ? this.validNnIntervals[this.validNnIntervals.length - 1] : null;

    for (let b = 0; b < beats.length; b++) {
      const beat = beats[b];
      const nextFootIdx = beat.sampleIndices.endIdx;
      const beatFootTime = beat.intersectingTangentFoot.time;

      if (beatFootTime <= this.lastDetectedFootTime) {
        continue;
      }

      const prevTime = this.lastDetectedFootTime > 0 ? this.lastDetectedFootTime : (b > 0 ? beats[b - 1].intersectingTangentFoot.time : beatFootTime - 0.8);
      const ibi = beatFootTime - prevTime;

      const sqi = this.sqiProtocol.evaluateBeat(
        beat,
        filteredPPG,
        dPPG,
        pressure.perfusionIndexG,
        ibi,
        prevIbi,
        nextFootIdx
      );

      const cardiacCycle: CardiacCycle = {
        cycleIndex: this.validNnIntervals.length,
        foot: beat.diastolicFoot,
        intersectingTangentFoot: beat.intersectingTangentFoot,
        m1d: beat.m1d,
        peak: beat.systolicPeak,
        ibiSec: Math.round(ibi * 1000) / 1000,
        instantaneousHrBpm: Math.round((60.0 / ibi) * 10) / 10,
        crestTimeMs: Math.round(beat.crestTimeMs * 10) / 10,
        amplitude: Math.round(beat.amplitude * 1000) / 1000,
        sqiValid: sqi.overallValid,
        sqiDetails: sqi,
      };

      this.latestCycle = cardiacCycle;
      this.lastDetectedFootTime = beatFootTime;

      // Notify beat listeners
      for (const beatListener of this.onBeatListeners) {
        beatListener(cardiacCycle);
      }

      if (sqi.overallValid) {
        this.validNnIntervals.push(ibi);
        this.validNnTimes.push(beatFootTime);
        prevIbi = ibi;

        // Keep rolling beat buffer to max 300 beats
        if (this.validNnIntervals.length > 300) {
          this.validNnIntervals.shift();
          this.validNnTimes.shift();
        }

        // Analyze SDPPG morphology for vascular aging
        const sdppgMetrics = SDPPGAnalyzer.analyzeCycle(beat, uniformTimes, sdppg);
        if (sdppgMetrics) {
          this.latestSdppg = sdppgMetrics;
        }
      }
    }

    // Step 6: PRV / HRV Metrics (time, frequency, non-linear)
    if (this.validNnIntervals.length >= 5) {
      const prv = PRVAnalyzer.computePRVMetrics(this.validNnIntervals, this.validNnTimes);
      if (prv) {
        this.latestPrv = prv;
      }
    }

    // Step 7: Tri-Modal Respiration Estimation (BW, AM, FM)
    if (uniformTimes.length >= Math.round(8.0 * fs)) {
      this.latestRespiration = this.computeRespiration(uniformTimes, winGreen, beats);
    }

    // Step 8: Emergency Triage Evaluation
    const hasRecentBeats = this.lastDetectedFootTime > 0 && (timestamp - this.lastDetectedFootTime) < 3.0;
    const triage = this.triageEngine.evaluate(
      elapsed,
      pressure,
      this.latestPrv ?? null,
      this.latestRespiration ?? null,
      hasRecentBeats
    );

    const prevSeverity = this.latestTriage?.severity;
    this.latestTriage = triage;

    if (triage.severity !== 'NORMAL' && triage.severity !== prevSeverity) {
      for (const emergencyListener of this.onEmergencyListeners) {
        emergencyListener(triage);
      }
    }

    // Step 9: Assemble full HemodynamicSnapshot and notify telemetry listeners
    const snapshot: HemodynamicSnapshot = {
      timestamp,
      elapsedSeconds: Math.round(elapsed * 10) / 10,
      rawSample: latestRaw,
      grdPulse: posPulse, // Keep key name to satisfy HemodynamicSnapshot type
      filteredPPG: filteredPPG[filteredPPG.length - 1] ?? posPulse,
      contactPressure: pressure,
      latestCycle: this.latestCycle,
      prv: this.latestPrv,
      sdppg: this.latestSdppg,
      respiration: this.latestRespiration,
      oximetry: this.latestOximetry,
      triage: this.latestTriage,
    };

    for (const telemetryListener of this.onTelemetryListeners) {
      telemetryListener(snapshot);
    }
  }

  private computeRespiration(
    times: Float64Array,
    rawGreen: Float64Array,
    beats: RawBeatCycle[]
  ): RespirationResult {
    const fs = this.config.samplingRate;
    const duration = times[times.length - 1] - times[0];

    // Channel 1: Baseline Wander (BW) - 3rd-order Butterworth bandpass (0.1 - 0.4 Hz)
    const bwFiltered = this.butterworth.filterRespirationFiltfilt(rawGreen);
    const timeDomainBwRate = this.respirationEngine.countTimeDomainBW(bwFiltered, duration);

    // Resample BW to 4.0 Hz for AR modeling
    const { values: bw4Hz } = PCHIPResampler.resampleUniform(times, bwFiltered, 4.0);
    const bwEstimate = this.respirationEngine.estimateChannel('BW', bw4Hz, timeDomainBwRate / 60.0);

    // Channel 2: Amplitude Modulation (AM)
    let amEstimate: import('../types').RespirationChannelEstimate = {
      channel: 'AM',
      frequencyHz: 0.2,
      breathsPerMinute: 12,
      poleRadius: 0,
      spectralPeakToNoiseRatio: 0,
      valid: false,
    };

    if (beats.length >= 6) {
      const beatTimes = beats.map((b) => b.systolicPeak.time);
      const beatAmps = beats.map((b) => b.amplitude);
      const { values: am4Hz } = PCHIPResampler.resampleUniform(beatTimes, beatAmps, 4.0);
      amEstimate = this.respirationEngine.estimateChannel('AM', am4Hz);
    }

    // Channel 3: Frequency Modulation (FM / RSA)
    let fmEstimate: import('../types').RespirationChannelEstimate = {
      channel: 'FM',
      frequencyHz: 0.2,
      breathsPerMinute: 12,
      poleRadius: 0,
      spectralPeakToNoiseRatio: 0,
      valid: false,
    };

    if (this.validNnIntervals.length >= 6) {
      const { values: fm4Hz } = PCHIPResampler.resampleUniform(this.validNnTimes, this.validNnIntervals, 4.0);
      fmEstimate = this.respirationEngine.estimateChannel('FM', fm4Hz);
    }

    return this.respirationEngine.fuseRespiration(
      bwEstimate,
      amEstimate,
      fmEstimate,
      timeDomainBwRate
    );
  }
}
