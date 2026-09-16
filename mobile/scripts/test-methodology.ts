import {
  OptROIS,
  GreenRedDifference,
  ContactPressureGauge,
  PCHIPResampler,
  ButterworthFilter,
  FiducialDetector,
  SQIProtocol,
  PRVAnalyzer,
  SDPPGAnalyzer,
  RespirationEngine,
  OximetryProxy,
  TriageEngine,
  HemodynamicPipeline,
} from '../src/processing';

console.log('=== RUNNING HEMODYNAMIC & DSP METHODOLOGY VERIFICATION SUITE ===\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

// 1. OptROIS Test
console.log('--- 1. Testing OptROIS Dynamic Grid SNR Optimizer ---');
const optRois = new OptROIS({ gridRows: 8, gridCols: 8, topPercentile: 0.2 });
const totalBlocks = 64;

// Generate 64 block means with known SNR profiles and saturation
const blockR = new Float32Array(totalBlocks);
const blockG = new Float32Array(totalBlocks);
const blockB = new Float32Array(totalBlocks);

for (let i = 0; i < totalBlocks; i++) {
  if (i < 5) {
    // Saturated flare blocks
    blockR[i] = 250;
    blockG[i] = 245;
    blockB[i] = 100;
  } else if (i < 10) {
    // Dark / shot noise blocks
    blockR[i] = 30;
    blockG[i] = 10;
    blockB[i] = 5;
  } else if (i >= 10 && i < 20) {
    // High pulsatility blocks
    blockR[i] = 180;
    blockG[i] = 120 + 15 * Math.sin((i * Math.PI) / 4);
    blockB[i] = 40;
  } else {
    // Low SNR background blocks
    blockR[i] = 160;
    blockG[i] = 110 + 1 * Math.sin(i);
    blockB[i] = 35;
  }
}

// Feed 120 samples (1 second) to build SNR
let sampleOutput = optRois.processBlockMeans(blockR, blockG, blockB, 0);
for (let t = 1; t < 120; t++) {
  // Vary high-pulsatility blocks over time
  for (let i = 10; i < 20; i++) {
    blockG[i] = 120 + 20 * Math.sin((2 * Math.PI * 1.2 * t) / 120);
  }
  sampleOutput = optRois.processBlockMeans(blockR, blockG, blockB, t / 120);
}

assert(sampleOutput.green > 0 && sampleOutput.green < 240, 'OptROIS outputs valid green channel within unsaturated limits');
assert(sampleOutput.red > 0 && sampleOutput.red < 245, 'OptROIS outputs valid red channel within limits');

// 2. Green-Red Difference (GRD) Motion Suppression Test
console.log('\n--- 2. Testing GRD Motion Suppression ---');
const grd = new GreenRedDifference({ windowSeconds: 2.0, samplingRate: 120 });
const grdOutputs: number[] = [];

// Simulate optical pulse + common-mode motion bump
for (let i = 0; i < 240; i++) {
  const t = i / 120;
  const cardiacPulse = 3.0 * Math.sin(2 * Math.PI * 1.2 * t);
  const motionArtifact = 15.0 * Math.sin(2 * Math.PI * 0.3 * t); // shared motion

  const g = 120 + cardiacPulse + motionArtifact;
  const r = 180 + 0.2 * cardiacPulse + motionArtifact; // red reflects motion equally

  const sPulse = grd.processSample(r, g);
  grdOutputs.push(sPulse);
}

assert(grdOutputs.length === 240, 'GRD processes 240 samples over 2 seconds');
assert(!isNaN(grdOutputs[200]), 'GRD produces valid non-NaN pulse values');

// 3. Contact Pressure Gauge Test
console.log('\n--- 3. Testing Contact Pressure & Transmural Gating ---');
const pressureGauge = new ContactPressureGauge();

// Test under-pressure: very low green DC
const underFeedback = pressureGauge.evaluateSample(50, 20);
assert(underFeedback.state === 'UNDER_PRESSURE', 'Detects under-pressure on weak signal', `got ${underFeedback.state}`);

// Test over-pressure / blanching: high DC green and low AC pulsatility
pressureGauge.reset();
let blanchFeedback = underFeedback;
for (let i = 0; i < 180; i++) {
  blanchFeedback = pressureGauge.evaluateSample(230, 220 + 0.01 * Math.sin(i));
}
assert(blanchFeedback.state === 'OVER_PRESSURE', 'Detects blanching / over-pressure when green surges and PI collapses', `got ${blanchFeedback.state}`);

// Test optimal contact: rhythmic signal with PI >= 0.15%
pressureGauge.reset();
let optFeedback = underFeedback;
for (let i = 0; i < 180; i++) {
  optFeedback = pressureGauge.evaluateSample(150, 110 + 2.5 * Math.sin((2 * Math.PI * 1.2 * i) / 120));
}
assert(optFeedback.isOptimal, 'Detects optimal contact for clean pulsatile signal', `PI_G=${optFeedback.perfusionIndexG.toFixed(3)}%`);

// 4. PCHIP Resampler Test
console.log('\n--- 4. Testing PCHIP Resampler ---');
const jitteredTimes = [0.0, 0.009, 0.017, 0.024, 0.033, 0.042, 0.050];
const sampleValues = [0.0, 0.3, 0.7, 1.0, 0.7, 0.3, 0.0];
const { times: resampledTimes, values: resampledValues } = PCHIPResampler.resampleUniform(jitteredTimes, sampleValues, 120);

assert(resampledTimes.length > 0, 'PCHIP resamples onto uniform grid');
assert(Math.max(...resampledValues) <= 1.05 && Math.min(...resampledValues) >= -0.05, 'PCHIP does not produce false overshoots');

// 5. Butterworth Filter & Derivatives Test
console.log('\n--- 5. Testing Butterworth Filter & Numerical Derivatives ---');
const bwFilter = new ButterworthFilter({ samplingRate: 120 });
const testFs = 120;
const testDurationSec = 3.0;
const nPoints = Math.round(testFs * testDurationSec);
const synSignal = new Float64Array(nPoints);
const synTimes = new Float64Array(nPoints);

for (let i = 0; i < nPoints; i++) {
  const t = i / testFs;
  synTimes[i] = t;
  // 1.2 Hz cardiac signal (72 BPM) + 0.2 Hz respiratory wander + 15 Hz noise
  synSignal[i] = 1.0 * Math.sin(2 * Math.PI * 1.2 * t) + 0.5 * Math.sin(2 * Math.PI * 0.2 * t) + 0.1 * Math.sin(2 * Math.PI * 15 * t);
}

const filteredCardiac = bwFilter.filterCardiacFiltfilt(synSignal);
assert(filteredCardiac.length === nPoints, 'Filtfilt cardiac bandpass preserves length');

const d1 = ButterworthFilter.computeFirstDerivative(filteredCardiac, testFs);
const d2 = ButterworthFilter.computeSecondDerivative(filteredCardiac, testFs);
assert(d1.length === nPoints && d2.length === nPoints, '5-point stencil derivatives computed successfully');

// 6. Fiducial Detector & Intersecting Tangents Test
console.log('\n--- 6. Testing Fiducial Timing (Intersecting Tangents & M1D) ---');
const fiducialDetector = new FiducialDetector(120);
const detectedBeats = fiducialDetector.detectBeats(synTimes, filteredCardiac, d1);

assert(detectedBeats.length >= 2, `FiducialDetector detected ${detectedBeats.length} cardiac cycles`);
if (detectedBeats.length >= 2) {
  const firstBeat = detectedBeats[0];
  assert(firstBeat.intersectingTangentFoot.time <= firstBeat.systolicPeak.time, 'IT foot precedes systolic peak');
  assert(firstBeat.crestTimeMs > 50 && firstBeat.crestTimeMs < 350, `Crest time within physiological bounds: ${firstBeat.crestTimeMs.toFixed(1)} ms`);
}

// 7. Multi-Tier SQI Protocol Test
console.log('\n--- 7. Testing Multi-Tier SQI Protocol ---');
const sqiProtocol = new SQIProtocol(100);
if (detectedBeats.length >= 2) {
  const beat = detectedBeats[0];
  const sqiReport = sqiProtocol.evaluateBeat(
    beat,
    filteredCardiac,
    d1,
    0.8, // 0.8% PI
    0.833, // 72 BPM -> 0.833s
    null,
    detectedBeats[1].sampleIndices.footIdx
  );

  assert(sqiReport.piSqiPassed, 'PI SQI gate passes');
  assert(sqiReport.zeroCrossingPassed, 'Zero crossing integrity gate passes for smooth synthetic beat');
  assert(sqiReport.physiologicalBoundPassed, 'Physiological bounds gate passes');
}

// 8. PRV Analyzer Test
console.log('\n--- 8. Testing PRV Metrics (Time, Frequency, Non-Linear) ---');
const syntheticIbiSec = [0.83, 0.84, 0.82, 0.85, 0.83, 0.84, 0.81, 0.86, 0.83, 0.82, 0.84, 0.83];
const syntheticTimestamps = [0.83, 1.67, 2.49, 3.34, 4.17, 5.01, 5.82, 6.68, 7.51, 8.33, 9.17, 10.0];
const prv = PRVAnalyzer.computePRVMetrics(syntheticIbiSec, syntheticTimestamps);

assert(prv !== null, 'PRV metrics successfully computed');
if (prv) {
  assert(prv.timeDomain.meanHrBpm > 65 && prv.timeDomain.meanHrBpm < 75, `Mean HR accurate: ${prv.timeDomain.meanHrBpm} BPM`);
  assert(prv.timeDomain.sdnnMs > 0, `SDNN positive: ${prv.timeDomain.sdnnMs} ms`);
  assert(prv.timeDomain.rmssdMs > 0, `RMSSD positive: ${prv.timeDomain.rmssdMs} ms`);
  assert(prv.nonLinear.sd1Ms >= 0 && prv.nonLinear.sd2Ms >= 0, `Poincaré SD1/SD2 positive`);
}

// 9. SDPPG Morphology & Vascular Aging Test
console.log('\n--- 9. Testing SDPPG Morphology & Aging Index ---');
if (detectedBeats.length >= 2) {
  const sdppgMetrics = SDPPGAnalyzer.analyzeCycle(detectedBeats[0], synTimes, d2);
  if (sdppgMetrics) {
    assert(typeof sdppgMetrics.agingIndex === 'number', `Aging Index computed: ${sdppgMetrics.agingIndex}`);
    assert(typeof sdppgMetrics.baRatio === 'number', `b/a ratio computed: ${sdppgMetrics.baRatio}`);
  } else {
    console.log('ℹ️ SDPPG cycle morphology skipped on ideal sinusoid (requires multi-harmonic beat)');
  }
}

// 10. Tri-Modal Respiration Engine Test
console.log('\n--- 10. Testing Tri-Modal Respiration Engine & Burg AR Pole Conditioning ---');
const respEngine = new RespirationEngine();
const respFs = 4.0;
const respDurationSec = 30.0;
const respSamples = Math.round(respFs * respDurationSec);
const trueRespHz = 0.25; // 15 BrPM
const respSignal = new Float64Array(respSamples);

for (let i = 0; i < respSamples; i++) {
  const t = i / respFs;
  respSignal[i] = 2.0 * Math.sin(2 * Math.PI * trueRespHz * t) + 0.1 * (Math.random() - 0.5);
}

const tdCount = respEngine.countTimeDomainBW(respSignal, respDurationSec);
const bwEst = respEngine.estimateChannel('BW', respSignal, tdCount / 60.0);
assert(bwEst.valid, 'AR model identifies valid candidate respiratory pole');
assert(bwEst.poleRadius >= 0.90, `Pole magnitude condition satisfied: ${bwEst.poleRadius.toFixed(3)} >= 0.90`);
assert(Math.abs(bwEst.breathsPerMinute - 15.0) < 2.0, `Respiratory rate accurate: ${bwEst.breathsPerMinute.toFixed(1)} BrPM (expected 15)`);

// 11. Oximetry Proxy Test
console.log('\n--- 11. Testing Reflectance SpO2 Proxy ---');
const oximetry = new OximetryProxy();
let oxResult = oximetry.updateSample(180, 120, true);

for (let i = 0; i < 250; i++) {
  const acG = 3.0 * Math.sin(i * 0.1);
  const acR = 2.0 * Math.sin(i * 0.1);
  oxResult = oximetry.updateSample(180 + acR, 120 + acG, true);
}

assert(oxResult.spo2SurrogatePct >= 85 && oxResult.spo2SurrogatePct <= 100, `SpO2 surrogate in physiological bounds: ${oxResult.spo2SurrogatePct.toFixed(1)}%`);
assert(oxResult.ratioOfRatios > 0, `Ratio of ratios computed: ${oxResult.ratioOfRatios}`);

// 12. Triage Engine Test
console.log('\n--- 12. Testing Emergency Triage Engine ---');
const triageEngine = new TriageEngine();

// Test normal state
const normalPressure = {
  state: 'OPTIMAL' as const,
  perfusionIndexG: 0.8,
  perfusionIndexR: 0.5,
  meanGreen: 120,
  deltaGreenVarianceRatio: 0.02,
  message: 'Optimal contact',
  isOptimal: true,
  isStable: true,
};

const normalStatus = triageEngine.evaluate(2.0, normalPressure, prv, null, true);
assert(normalStatus.severity === 'NORMAL' && !normalStatus.cprRequired, 'Normal vital status produces NORMAL triage');

// Test pulselessness / asystole -> CPR trigger
triageEngine.reset();
const asystolePressure = {
  ...normalPressure,
  perfusionIndexG: 0.01, // complete collapse
};

let asystoleStatus = normalStatus;
// Run for 50 steps (5 seconds elapsed, exceeding 3.5s pulseless threshold)
for (let i = 0; i < 55; i++) {
  asystoleStatus = triageEngine.evaluate(4.0 + i * 0.1, asystolePressure, null, null, false);
}

assert(asystoleStatus.severity === 'CRITICAL_CPR_ASYSTOLE', 'Detects asystole and triggers CRITICAL_CPR');
assert(asystoleStatus.cprRequired && asystoleStatus.cprMetronomeBpm === 110, 'Triggers 110 BPM CPR metronome guidance');

// 13. End-to-End HemodynamicPipeline Integration Test
console.log('\n--- 13. Testing End-to-End HemodynamicPipeline ---');
const pipeline = new HemodynamicPipeline({ samplingRate: 120 });
let samplesProcessed = 0;
let beatsReported = 0;
let telemetryUpdates = 0;

pipeline.subscribeSample(() => samplesProcessed++);
pipeline.subscribeBeat(() => beatsReported++);
pipeline.subscribeTelemetry(() => telemetryUpdates++);

// Stream 3 seconds of realistic synthetic contact data (360 samples)
for (let i = 0; i < 360; i++) {
  const t = i / 120;
  // Realistic multi-harmonic pulse
  const pulse =
    2.5 * Math.sin(2 * Math.PI * 1.25 * t) +
    0.8 * Math.sin(2 * Math.PI * 2.5 * t) +
    0.3 * Math.sin(2 * Math.PI * 3.75 * t);

  pipeline.pushSample({
    timestamp: t,
    red: 170 + 0.5 * pulse,
    green: 120 + pulse,
    blue: 40,
  });
}

assert(samplesProcessed === 360, `Pipeline processed all 360 samples: got ${samplesProcessed}`);
assert(telemetryUpdates > 0, `Pipeline emitted periodic telemetry updates: got ${telemetryUpdates}`);

console.log(`\n======================================================`);
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
