/**
 * High-Speed Contact Photoplethysmography (sPPG) & Hemodynamic DSP Types
 * Based on METHODOLOGY.md for Sternum/Chest and Arm Cutaneous Site Placement (120+ FPS)
 */

export interface RawOpticalSample {
  timestamp: number; // in seconds or milliseconds
  red: number;
  green: number;
  blue: number;
}

export interface SpatialBlockMetrics {
  blockIndex: number;
  meanR: number;
  meanG: number;
  meanB: number;
  snr: number; // sigma(G) / mu(G)
  valid: boolean;
  rejectedReason?: 'saturation' | 'shot_noise' | 'none';
}

export interface OptROISConfig {
  gridRows: number; // 8
  gridCols: number; // 8
  saturationRedMax: number; // 245
  saturationGreenMax: number; // 240
  darkGreenMin: number; // 15
  topPercentile: number; // 0.15 - 0.20 (top 15-20%)
  calibrationWindowSec: number; // 1.0 s
  samplingRate: number; // 120 Hz
}

export type ContactPressureState =
  | 'UNDER_PRESSURE'
  | 'OPTIMAL'
  | 'OVER_PRESSURE'
  | 'PRESSURE_UNSTABLE';

export interface ContactPressureFeedback {
  state: ContactPressureState;
  perfusionIndexG: number; // PI_G in %
  perfusionIndexR: number; // PI_R in %
  meanGreen: number;
  deltaGreenVarianceRatio: number; // delta mu_G / mu_G over 500 ms
  message: string;
  isOptimal: boolean;
  isStable: boolean;
}

export interface FiducialPoint {
  index: number;
  time: number; // in seconds
  value: number;
}

export interface CardiacCycle {
  cycleIndex: number;
  foot: FiducialPoint; // Diastolic minimum
  intersectingTangentFoot: FiducialPoint; // IT primary fiducial timing point
  m1d: FiducialPoint; // Maximum first derivative point
  peak: FiducialPoint; // Systolic peak
  nextFoot?: FiducialPoint;
  ibiSec: number; // Inter-beat interval in seconds
  instantaneousHrBpm: number;
  crestTimeMs: number; // Peak time - Foot time in ms
  amplitude: number; // Peak value - Foot value
  sqiValid: boolean;
  sqiDetails: SQIReport;
}

export interface SQIReport {
  piSqiPassed: boolean;
  templateCorrelationPassed: boolean;
  templateCorrelation: number; // r with ensemble average template
  skewnessPassed: boolean;
  skewness: number; // S > 0
  zeroCrossingPassed: boolean;
  zeroCrossingsCount: number; // exactly 2 required
  physiologicalBoundPassed: boolean;
  jumpPassed: boolean;
  overallValid: boolean;
}

export interface PRVTimeDomainMetrics {
  meanHrBpm: number;
  medianHrBpm: number;
  sdnnMs: number;
  rmssdMs: number;
  pnn50Pct: number;
  validIntervalsCount: number;
}

export interface PRVFrequencyDomainMetrics {
  vlfPower: number; // 0.0033 - 0.04 Hz
  lfPower: number;  // 0.04 - 0.15 Hz
  hfPower: number;  // 0.15 - 0.40 Hz
  lfHfRatio: number;
  lfNormalizedUnits: number; // LF / (LF + HF) * 100
  hfNormalizedUnits: number; // HF / (LF + HF) * 100
  totalPower: number;
}

export interface PRVNonLinearMetrics {
  sd1Ms: number; // Poincaré short-term variability
  sd2Ms: number; // Poincaré long-term variability
  sd1Sd2Ratio: number;
}

export interface PRVMetrics {
  timeDomain: PRVTimeDomainMetrics;
  frequencyDomain: PRVFrequencyDomainMetrics;
  nonLinear: PRVNonLinearMetrics;
}

export interface SDPPGComponents {
  a: FiducialPoint; // Early systolic positive acceleration
  b: FiducialPoint; // Early systolic deceleration trough
  c: FiducialPoint; // Late systolic re-acceleration
  d: FiducialPoint; // Late systolic deceleration
  e: FiducialPoint; // Early diastolic dicrotic notch
  agingIndex: number; // (b - c - d - e) / a
  baRatio: number; // b / a
  crestTimeMs: number;
}

export interface RespirationChannelEstimate {
  channel: 'BW' | 'AM' | 'FM';
  frequencyHz: number;
  breathsPerMinute: number;
  poleRadius: number; // Must be >= 0.90 in AR modeling
  spectralPeakToNoiseRatio: number; // SPNR
  valid: boolean;
}

export interface RespirationResult {
  respiratoryRateBrPM: number;
  confidence: number; // 0.0 to 1.0
  channelEstimates: {
    bw?: RespirationChannelEstimate;
    am?: RespirationChannelEstimate;
    fm?: RespirationChannelEstimate;
  };
  timeDomainBwRateBrPM: number;
  timeDomainAgreement: boolean;
  selectedMethod: 'consensus_bw_am' | 'consensus_bw_fm' | 'consensus_am_fm' | 'spnr_bw_verified' | 'time_domain_bw_fallback';
}

export interface OximetryMetrics {
  acGreen: number;
  dcGreen: number;
  acRed: number;
  dcRed: number;
  piGreen: number;
  piRed: number;
  ratioOfRatios: number; // Pathlength corrected R
  spo2SurrogatePct: number; // 85% to 100%
  isPressureStable: boolean;
  isCalibrated: boolean;
}

export type TriageSeverity =
  | 'NORMAL'
  | 'WARNING_ARRHYTHMIA'
  | 'WARNING_RESPIRATORY_DEPRESSION'
  | 'CRITICAL_CPR_ASYSTOLE'
  | 'CRITICAL_CPR_VF_VT'
  | 'CRITICAL_AIRWAY_AGONAL';

export interface TriageStatus {
  severity: TriageSeverity;
  alertHeadline: string;
  actionPrompt: string;
  cprRequired: boolean;
  cprMetronomeBpm: number; // 100 - 120 BPM
  pulseDetected: boolean;
  agonalBreathing: boolean;
}

export interface HemodynamicSnapshot {
  timestamp: number;
  elapsedSeconds: number;
  rawSample: RawOpticalSample;
  grdPulse: number;
  filteredPPG: number;
  contactPressure: ContactPressureFeedback;
  latestCycle?: CardiacCycle;
  prv?: PRVMetrics;
  sdppg?: SDPPGComponents;
  respiration?: RespirationResult;
  oximetry: OximetryMetrics;
  triage: TriageStatus;
}
