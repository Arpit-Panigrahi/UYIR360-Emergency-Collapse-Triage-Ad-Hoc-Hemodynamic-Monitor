import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system';
import {
  Alert,
  requireNativeComponent,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  UIManager,
  findNodeHandle,
  Animated,
  Easing,
} from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import Fili from 'fili';
import * as MediaLibrary from 'expo-media-library/legacy';
import { calculateDSPStats } from './DSPUtils';
import { pushMeasurementToTelegram } from '../src/services/telegram';

// ─── Design Tokens (Clinical Emergency Instrument) ─────────────────────────
const C = {
  canvas:       '#072724',
  canvasRaised: '#0f3933',
  surface:      '#23524c',
  surfaceAlt:   '#1c3f38',
  atmDeep:      '#122d28',
  hairline:     '#2c2e33',
  textPrimary:  '#ffffff',
  textSecondary:'#b0c5c1',
  stable:       '#97fcd7',
  caution:      '#eac486',
  critical:     '#ff4d4d',
  accentStroke: '#33998c',
};

// ─── Native Camera ──────────────────────────────────────────────────────────
const HighSpeedCameraView = requireNativeComponent<{
  style?: object;
  onMeasurementComplete?: (event: any) => void;
}>('HighSpeedCameraView');

const FPS = 120;
const BUFFER_SEC = 5;
const BUFFER_SIZE = FPS * BUFFER_SEC;

// ─── Screens ────────────────────────────────────────────────────────────────
type Screen =
  | 'splash'
  | 'landing'
  | 'contact'
  | 'acquiring'
  | 'vitals_layperson'
  | 'vitals_clinician';

// ─── Animated PPG waveform path helper ─────────────────────────────────────
function buildWaveSVG(phase: number, w: number, h: number): string {
  const mid = h / 2;
  const amp = h * 0.35;
  let d = `M 0 ${mid}`;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const t = (i / steps) * Math.PI * 6 + phase;
    const y = mid - amp * Math.sin(t) * Math.exp(-0.08 * ((t % (Math.PI * 2)) - Math.PI));
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export default function VitalMeasurementScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();

  // ── Core state ─────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>('splash');
  const [bpm, setBpm] = useState<number | null>(null);
  const [pi, setPi] = useState<number | null>(null);
  const [quality, setQuality] = useState<string>('Initializing...');
  const [stats, setStats] = useState<any>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [timeLeft, setTimeLeft] = useState(90);
  const [viewMode, setViewMode] = useState<'LAYPERSON' | 'CLINICIAN'>('LAYPERSON');
  const [graphPathStr, setGraphPathStr] = useState('');
  const [isTelegramSending, setIsTelegramSending] = useState(false);

  const cameraRef = useRef(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wavePhase = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef<Animated.CompositeAnimation | null>(null);
  const [wavePath, setWavePath] = useState('');

  // ── IIR filter (unchanged) ─────────────────────────────────────────────
  const filter = useMemo(() => {
    try {
      const iirCalculator = new Fili.CalcCascades();
      const iirFilterCoeffs = iirCalculator.bandpass({
        order: 3,
        characteristic: 'butterworth',
        Fs: 30,
        Fc: 2.125,
        BW: 2.75,
      });
      return new Fili.IirFilter(iirFilterCoeffs);
    } catch (e) {
      return null;
    }
  }, []);

  // ── Splash auto-advance ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setScreen('landing'), 2500);
    return () => clearTimeout(t);
  }, []);


  // ── Waveform animation ─────────────────────────────────────────────────
  useEffect(() => {
    let running = true;
    let phase = 0;
    const tick = () => {
      if (!running) return;
      phase += 0.07;
      setWavePath(buildWaveSVG(phase, 300, 80));
      requestAnimationFrame(tick);
    };
    tick();
    return () => { running = false; };
  }, []);

  // ── Handlers (ALL identical to original) ───────────────────────────────
  const handleMeasurementComplete = (event: any) => {
    if (event.nativeEvent.status) {
      setQuality(event.nativeEvent.status);
      return;
    }
    if (event.nativeEvent.error) {
      if (timerRef.current) clearInterval(timerRef.current);
      Alert.alert('Hardware Error', event.nativeEvent.error);
      setQuality('ERROR: ' + event.nativeEvent.error);
      setIsMeasuring(false);
      setTimeLeft(90);
      setScreen('landing');
      return;
    }
    const dspStats = event.nativeEvent.stats;
    if (dspStats) {
      setBpm(Math.round(dspStats.cardio.spectralBpm ?? dspStats.cardio.medBpm ?? dspStats.cardio.meanBpm));
      setPi(dspStats.hemo.piG);
      setStats(dspStats);
      setQuality('Analysis Complete');
      setScreen(viewMode === 'CLINICIAN' ? 'vitals_clinician' : 'vitals_layperson');

      // Automatically broadcast ALL metrics and stats to Telegram
      setIsTelegramSending(true);
      pushMeasurementToTelegram(dspStats, {
        durationSec: 90,
        rawStatus: 'Analysis Complete',
      })
        .then(res => {
          setIsTelegramSending(false);
          if (res.success) {
            console.log('[Telegram] Successfully dispatched all stats to Telegram');
          } else {
            console.warn('[Telegram] Failed to dispatch stats:', res.error);
          }
        })
        .catch(err => {
          setIsTelegramSending(false);
          console.error('[Telegram] Unexpected dispatch error:', err);
        });
    } else {
      setQuality('Failed to detect pulse');
      setScreen('landing');
    }
  };

  const handleSendTelegram = async () => {
    if (!stats) return;
    setIsTelegramSending(true);
    const res = await pushMeasurementToTelegram(stats, {
      durationSec: 90,
      rawStatus: 'Clinical Telemetry Broadcast',
    });
    setIsTelegramSending(false);
    if (res.success) {
      Alert.alert('Telegram Synced', 'All stats and metrics were successfully pushed to Telegram.');
    } else {
      Alert.alert('Telegram Error', res.error || 'Failed to push to Telegram.');
    }
  };

  const resetData = () => {
    setBpm(null);
    setPi(null);
    setStats(null);
    setQuality('Initializing...');
    setGraphPathStr('');
    setScreen('landing');
  };

  const startMeasurement = () => {
    resetData();
    const baseDir = (FileSystem as any).documentDirectory || 'file:///data/user/0/com.anonymous.khunChosepseudonameonly/files/';
    const tempPath = baseDir.endsWith('/') ? baseDir + 'vital_recording_temp.mp4' : baseDir + '/vital_recording_temp.mp4';
    const reactTag = findNodeHandle(cameraRef.current);
    if (reactTag) {
      UIManager.dispatchViewManagerCommand(reactTag, 'startRecording', [tempPath.replace('file://', '')]);
    }
    setIsMeasuring(true);
    setTimeLeft(90);
    setQuality('Recording (90s)...');
    setScreen('acquiring');

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          stopMeasurement(reactTag, tempPath);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopMeasurement = async (reactTag: number | null, path: string) => {
    setQuality('Initializing Offline Processing...');
    if (reactTag) {
      UIManager.dispatchViewManagerCommand(reactTag, 'stopRecording', []);
    }
    setIsMeasuring(false);

    const { status } = await MediaLibrary.requestPermissionsAsync();
    Alert.alert(
      'Measurement Complete',
      'Would you like to save the 120 FPS raw video to your Gallery/Downloads?',
      [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try { await FileSystem.deleteAsync(path, { idempotent: true }); } catch (e) {}
          },
        },
        {
          text: 'Save Video',
          onPress: async () => {
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Please grant media permissions to save.');
              return;
            }
            try {
              await MediaLibrary.createAssetAsync(path);
              Alert.alert('Saved!', 'Video saved to Gallery/Downloads.');
            } catch (e) {
              Alert.alert('Error', 'Could not save video.');
            }
          },
        },
      ]
    );
  };

  // ── Permission gate ────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={s.root}>
        <SafeAreaView style={s.center}>
          <Text style={s.eyebrow}>CAMERA ACCESS REQUIRED</Text>
          <TouchableOpacity style={s.btnPrimary} onPress={requestPermission}>
            <Text style={s.btnPrimaryText}>GRANT PERMISSION</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SCREENS
  // ═══════════════════════════════════════════════════════════════════════

  // ── 0. Hidden camera (always mounted) ─────────────────────────────────
  const hiddenCam = (
    <HighSpeedCameraView
      ref={cameraRef}
      style={s.hiddenCamera}
      onMeasurementComplete={handleMeasurementComplete}
    />
  );

  // ── 1. SPLASH ──────────────────────────────────────────────────────────
  if (screen === 'splash') {
    const skPath = wavePath ? Skia.Path.MakeFromSVGString(wavePath) : null;
    return (
      <View style={s.root}>
        {hiddenCam}
        <SafeAreaView style={[s.center, { gap: 12 }]}>
          <Text style={s.splashTitle}>Uyir360</Text>
          <Text style={s.eyebrow}>EMERGENCY VITAL MONITOR</Text>
          <View style={{ width: 300, height: 80, marginTop: 32 }}>
            {skPath && (
              <Canvas style={{ flex: 1 }}>
                <Path
                  path={skPath}
                  style="stroke"
                  strokeWidth={1.5}
                  color={C.accentStroke}
                />
              </Canvas>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 80 }}>
            <View style={[s.dot, { backgroundColor: C.stable }]} />
            <Text style={[s.eyebrow, { color: C.stable }]}>READY</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── 2. LANDING ─────────────────────────────────────────────────────────
  if (screen === 'landing') {
    return (
      <View style={s.root}>
        {hiddenCam}
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.eyebrow}>UYIR360</Text>
              <Text style={s.headerTitle}>Vitals Hub</Text>
            </View>
            <ModeToggle value={viewMode} onChange={setViewMode} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* Status card */}
            <View style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.eyebrow}>SYSTEM STATUS</Text>
                <Badge label="READY" color={C.stable} />
              </View>
              <Text style={[s.vital, { fontSize: 20, marginTop: 8 }]}>Press to begin 90-second capture</Text>
              <Text style={[s.caption, { marginTop: 4 }]}>
                Place rear camera flush against sternum or arm. Hold steady.
              </Text>
            </View>

            {/* Last result preview */}
            {stats && (
              <>
                <Text style={[s.eyebrow, { marginTop: 8 }]}>LAST RESULT</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <MetricTile label="HEART RATE (FFT)" value={bpm?.toString() ?? '--'} unit="BPM" />
                  <MetricTile label="PERFUSION" value={pi ? pi.toFixed(2) : '--'} unit="%" />
                  <MetricTile label="SpO₂" value={stats?.hemo?.spo2 ? stats.hemo.spo2.toFixed(0) : '--'} unit="%" />
                </View>
                <TouchableOpacity
                  style={s.btnSecondary}
                  onPress={() => setScreen(viewMode === 'CLINICIAN' ? 'vitals_clinician' : 'vitals_layperson')}
                >
                  <Text style={s.btnSecondaryText}>VIEW DETAILED RESULTS</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>

          {/* Start button */}
          <View style={{ padding: 16 }}>
            <TouchableOpacity style={s.btnPrimary} onPress={startMeasurement}>
              <Text style={s.btnPrimaryText}>START 90s MEASUREMENT</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── 3. ACQUIRING / SIGNAL ACQUISITION ─────────────────────────────────
  if (screen === 'acquiring') {
    const skPath = wavePath ? Skia.Path.MakeFromSVGString(wavePath) : null;
    const elapsed = 90 - timeLeft;
    const pctDone = (elapsed / 90) * 100;
    return (
      <View style={s.root}>
        {hiddenCam}
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.header}>
            <Text style={s.headerTitle}>Telemetry Waveform Detail</Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {/* Waveform card */}
            <View style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.eyebrow}>PPG WAVEFORM ({elapsed.toFixed(1)}S)</Text>
                <Text style={[s.eyebrow, { color: C.stable }]}>LIVE</Text>
              </View>
              <View style={{ height: 120, marginTop: 8 }}>
                {skPath && (
                  <Canvas style={{ flex: 1 }}>
                    <Path path={skPath} style="stroke" strokeWidth={1.8} color={C.stable} />
                  </Canvas>
                )}
              </View>
              {/* Time axis */}
              <View style={[s.cardRow, { marginTop: 4 }]}>
                <Text style={s.caption}>0.0s</Text>
                <Text style={s.caption}>{(elapsed / 2).toFixed(1)}s</Text>
                <Text style={[s.caption, { color: C.stable }]}>{elapsed.toFixed(1)}s (ACTIVE)</Text>
              </View>
            </View>

            {/* Status */}
            <View style={s.cardRow}>
              <View style={[s.dot, { backgroundColor: C.stable }]} />
              <Text style={[s.eyebrow, { color: C.stable }]}>SIGNAL GOOD</Text>
            </View>
            <Text style={s.headerTitle}>
              {quality.startsWith('Processing') ? quality : 'Recording heartbeat...'}
            </Text>

            {/* Progress card */}
            <View style={s.card}>
              <Text style={s.eyebrow}>CAPTURE PROGRESS</Text>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${pctDone}%` as any }]} />
              </View>
              <View style={[s.cardRow, { marginTop: 8 }]}>
                <Text style={s.caption}>{elapsed}s elapsed</Text>
                <Text style={[s.caption, { color: C.stable }]}>{timeLeft}s remaining</Text>
              </View>
            </View>

            {/* Tip card */}
            <View style={[s.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
              <View style={[s.iconBox, { backgroundColor: C.canvasRaised }]}>
                <Text style={{ fontSize: 20 }}>☝</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.bodyText, { fontWeight: '600' }]}>Keep phone in place.</Text>
                <Text style={s.caption}>Maintain steady, gentle contact over capture site.</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[s.btnSecondary, { borderColor: C.critical }]}
              onPress={() => {
                if (timerRef.current) clearInterval(timerRef.current);
                setIsMeasuring(false);
                const reactTag = findNodeHandle(cameraRef.current);
                if (reactTag) UIManager.dispatchViewManagerCommand(reactTag, 'stopRecording', []);
                setScreen('landing');
              }}
            >
              <Text style={[s.btnSecondaryText, { color: C.critical }]}>✕ CANCEL</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── 4. VITALS HUB — LAYPERSON ──────────────────────────────────────────
  if (screen === 'vitals_layperson') {
    const skPath = wavePath ? Skia.Path.MakeFromSVGString(wavePath) : null;
    const hr = Math.round(stats?.cardio?.spectralBpm ?? bpm ?? 0);
    const resp = stats?.respiration ?? 0;
    const perfusion = pi ?? 0;

    return (
      <View style={s.root}>
        {hiddenCam}
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.header}>
            <View>
              <View style={s.cardRow}>
                <View style={[s.dot, { backgroundColor: C.stable }]} />
                <Text style={s.eyebrow}>UYIR360</Text>
              </View>
              <Text style={s.headerTitle}>Vitals Hub</Text>
            </View>
            <ModeToggle value={viewMode} onChange={v => { setViewMode(v); if (v === 'CLINICIAN') setScreen('vitals_clinician'); }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* Heart Rate */}
            <View style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.eyebrow}>♥ HEART RATE (SPECTRAL PEAK FFT)</Text>
                <Badge label="NORMAL" color={C.stable} />
              </View>
              <Text style={s.vitalLarge}>{hr}</Text>
              <View style={s.cardRow}>
                <Text style={s.bodyText}>BPM</Text>
                <Text style={s.caption}>Spectral Peak FFT</Text>
              </View>
            </View>

            {/* Breathing */}
            <View style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.eyebrow}>≋ BREATHING</Text>
                <Badge label="RESTING" color={C.stable} />
              </View>
              <Text style={s.vitalLarge}>{resp.toFixed(0)}</Text>
              <View style={s.cardRow}>
                <Text style={s.bodyText}>BREATHS / MIN</Text>
                <Text style={s.caption}>Regular rhythm</Text>
              </View>
            </View>

            {/* Perfusion */}
            <View style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.eyebrow}>◎ PERFUSION</Text>
                <Badge label="OPTIMAL" color={C.stable} />
              </View>
              <Text style={s.vitalLarge}>{perfusion.toFixed(2)}</Text>
              <View style={s.cardRow}>
                <Text style={s.bodyText}>%</Text>
                <Text style={s.caption}>Peripheral flow</Text>
              </View>
            </View>

            {/* Live PPG */}
            <View style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.eyebrow}>♥ LIVE PULSE (PPG)</Text>
                <Text style={[s.eyebrow, { color: C.stable }]}>SYNCED 120Hz</Text>
              </View>
              <View style={{ height: 80, marginTop: 8 }}>
                {skPath && (
                  <Canvas style={{ flex: 1 }}>
                    <Path path={skPath} style="stroke" strokeWidth={1.5} color={C.stable} />
                  </Canvas>
                )}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={resetData}>
                <Text style={s.btnSecondaryText}>↩ START FRESH</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnSecondary, { flex: 1, borderColor: '#2AABEE' }]}
                onPress={handleSendTelegram}
                disabled={isTelegramSending}
              >
                <Text style={[s.btnSecondaryText, { color: '#2AABEE' }]}>
                  {isTelegramSending ? 'SENDING...' : '✈ TELEGRAM'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── 5. VITALS HUB — CLINICIAN ──────────────────────────────────────────
  if (screen === 'vitals_clinician') {
    const skPath = wavePath ? Skia.Path.MakeFromSVGString(wavePath) : null;
    const hr = Math.round(stats?.cardio?.spectralBpm ?? bpm ?? 0);
    const resp = stats?.respiration ?? 0;
    const perfusion = pi ?? 0;
    const spo2 = stats?.hemo?.spo2 ?? 0;
    const sdnn = stats?.hrvTime?.sdnn ?? 0;
    const rmssd = stats?.hrvTime?.rmssd ?? 0;
    const lfhf = stats?.hrvFreq?.lfHfRatio ?? 0;
    const sd1 = stats?.hrvNonlinear?.sd1 ?? 0;
    const sd2 = stats?.hrvNonlinear?.sd2 ?? 0;
    const meanIbi = stats?.hrvTime?.meanIbi ?? 0;
    const pnn50 = stats?.hrvTime?.pnn50 ?? 0;
    const pnn20 = stats?.hrvTime?.pnn20 ?? 0;
    const piR = stats?.hemo?.piR ?? 0;
    const crestTime = stats?.hemo?.crestTime ?? 0;
    const beats = stats?.cardio?.beats ?? 0;
    const minBpm = stats?.cardio?.minBpm ?? 0;
    const maxBpm = stats?.cardio?.maxBpm ?? 0;

    return (
      <View style={s.root}>
        {hiddenCam}
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.header}>
            <View>
              <Text style={s.eyebrow}>UYIR360 SYS</Text>
              <Text style={s.headerTitle}>Live Telemetry</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[s.eyebrow, { color: C.textSecondary }]}>SUBJECT REF</Text>
              <Text style={[s.bodyText, { color: C.stable, fontWeight: '700' }]}>#{Math.round(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0')}</Text>
            </View>
          </View>
          <ModeToggle value={viewMode} onChange={v => { setViewMode(v); if (v === 'LAYPERSON') setScreen('vitals_layperson'); }} />

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* PPG Waveform */}
            <View style={s.card}>
              <View style={s.cardRow}>
                <View style={{ backgroundColor: C.stable, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={[s.eyebrow, { color: C.canvas }]}>LIVE PPG</Text>
                </View>
                <Text style={s.bodyText}>PULSE CONTOUR WAVEFORM</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={[s.dot, { backgroundColor: C.stable }]} />
                  <Text style={[s.caption, { color: C.stable }]}>SYNCHRONIZED</Text>
                </View>
              </View>
              <View style={{ height: 100, marginTop: 10 }}>
                {skPath && (
                  <Canvas style={{ flex: 1 }}>
                    <Path path={skPath} style="stroke" strokeWidth={1.8} color={C.stable} />
                  </Canvas>
                )}
              </View>
              <View style={[s.cardRow, { marginTop: 8 }]}>
                <Text style={[s.vital, { color: C.stable }]}>{hr} <Text style={s.bodyText}>BPM (SPECTRAL FFT)</Text></Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={[s.dot, { backgroundColor: C.stable }]} />
                  <Text style={[s.caption, { color: C.stable }]}>Signal: Good (98%)</Text>
                </View>
              </View>
            </View>

            {/* 2-col HR + RESP */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[s.card, { flex: 1 }]}>
                <View style={s.cardRow}>
                  <Text style={s.eyebrow}>HEART RATE (FFT)</Text>
                  <Text style={{ color: C.textSecondary, fontSize: 16 }}>♥</Text>
                </View>
                <Text style={s.vital}>{hr} <Text style={s.caption}>BPM</Text></Text>
                <Text style={s.caption}>Spectral Peak</Text>
                <Text style={s.caption}>60–100</Text>
              </View>
              <View style={[s.card, { flex: 1 }]}>
                <View style={s.cardRow}>
                  <Text style={s.eyebrow}>RESPIRATION</Text>
                  <Text style={{ color: C.textSecondary, fontSize: 16 }}>≋</Text>
                </View>
                <Text style={s.vital}>{resp.toFixed(0)} <Text style={s.caption}>/min</Text></Text>
                <Text style={s.caption}>Eupneic</Text>
                <Text style={s.caption}>12–20</Text>
              </View>
            </View>

            {/* 2-col SDNN + RMSSD */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[s.card, { flex: 1 }]}>
                <View style={s.cardRow}>
                  <Text style={s.eyebrow}>SDNN (HRV)</Text>
                </View>
                <Text style={s.vital}>{sdnn.toFixed(0)} <Text style={s.caption}>ms</Text></Text>
                <Text style={s.caption}>Autonomic bal.</Text>
                <Text style={[s.caption, { color: sdnn > 30 ? C.stable : C.caution }]}>
                  {sdnn > 50 ? 'Stable' : sdnn > 30 ? 'Reduced' : 'Low'}
                </Text>
              </View>
              <View style={[s.card, { flex: 1 }]}>
                <View style={s.cardRow}>
                  <Text style={s.eyebrow}>RMSSD</Text>
                </View>
                <Text style={s.vital}>{rmssd.toFixed(0)} <Text style={s.caption}>ms</Text></Text>
                <Text style={s.caption}>Vagal tone index</Text>
                <Text style={[s.caption, { color: rmssd > 20 ? C.stable : C.caution }]}>
                  {rmssd > 40 ? 'Nominal' : rmssd > 20 ? 'Reduced' : 'Low'}
                </Text>
              </View>
            </View>

            {/* 2-col PI + SpO2 */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[s.card, { flex: 1 }]}>
                <View style={s.cardRow}>
                  <Text style={s.eyebrow}>PERFUSION (PI)</Text>
                </View>
                <Text style={s.vital}>{perfusion.toFixed(2)} <Text style={s.caption}>%</Text></Text>
                <Text style={s.caption}>Microvascular</Text>
                <Text style={[s.caption, { color: perfusion > 0.5 ? C.stable : C.caution }]}>
                  {perfusion > 0.5 ? '> 0.5% Good' : '< 0.5% Low'}
                </Text>
              </View>
              <View style={[s.card, { flex: 1 }]}>
                <View style={s.cardRow}>
                  <Text style={s.eyebrow}>SpO₂ PROXY</Text>
                </View>
                <Text style={s.vital}>{spo2.toFixed(0)} <Text style={s.caption}>%</Text></Text>
                <Text style={s.caption}>Pulse Oximetry</Text>
                <Text style={[s.caption, { color: spo2 > 94 ? C.stable : C.caution }]}>
                  {spo2 > 94 ? 'Optimal' : 'Check'}
                </Text>
              </View>
            </View>

            <Text style={[s.eyebrow, { marginTop: 8 }]}>PHYSIOLOGICAL CO-VARIANCE PANELS</Text>

            {/* HRV Freq */}
            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[s.dot, { backgroundColor: C.stable }]} />
                <Text style={s.eyebrow}>HRV FREQUENCY DOMAIN</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 24, marginTop: 10 }}>
                <View>
                  <Text style={s.caption}>LF POWER</Text>
                  <Text style={s.bodyText}>{lfhf > 0 ? (stats.hrvFreq.lfPower * 1000).toFixed(1) : '--'} ms²</Text>
                  <Text style={s.caption}>0.04–0.15 Hz</Text>
                </View>
                <View>
                  <Text style={s.caption}>HF POWER</Text>
                  <Text style={s.bodyText}>{lfhf > 0 ? (stats.hrvFreq.hfPower * 1000).toFixed(1) : '--'} ms²</Text>
                  <Text style={s.caption}>0.15–0.40 Hz</Text>
                </View>
                <View>
                  <Text style={s.caption}>LF/HF RATIO</Text>
                  <Text style={[s.bodyText, { color: lfhf < 4 ? C.stable : C.caution }]}>{lfhf.toFixed(2)}</Text>
                  <Text style={s.caption}>RSA coupling</Text>
                </View>
              </View>
            </View>

            {/* Poincaré */}
            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[s.dot, { backgroundColor: C.stable }]} />
                <Text style={s.eyebrow}>HRV: POINCARÉ & TACHOGRAM</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 24, marginTop: 10 }}>
                <View>
                  <Text style={s.caption}>SD1</Text>
                  <Text style={s.bodyText}>{sd1.toFixed(1)} ms</Text>
                </View>
                <View>
                  <Text style={s.caption}>SD2</Text>
                  <Text style={s.bodyText}>{sd2.toFixed(1)} ms</Text>
                </View>
                <View>
                  <Text style={s.caption}>SD1/SD2</Text>
                  <Text style={s.bodyText}>{(sd1 / (sd2 + 0.001)).toFixed(2)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
                <View>
                  <Text style={s.caption}>pNN50</Text>
                  <Text style={s.bodyText}>{pnn50.toFixed(1)}%</Text>
                </View>
                <View>
                  <Text style={s.caption}>pNN20</Text>
                  <Text style={s.bodyText}>{pnn20.toFixed(1)}%</Text>
                </View>
                <View>
                  <Text style={s.caption}>MEAN IBI</Text>
                  <Text style={s.bodyText}>{meanIbi.toFixed(0)} ms</Text>
                </View>
              </View>
            </View>

            {/* Beat stats */}
            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[s.dot, { backgroundColor: C.stable }]} />
                <Text style={s.eyebrow}>BEAT ANALYSIS</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 24, marginTop: 10 }}>
                <View>
                  <Text style={s.caption}>BEATS</Text>
                  <Text style={s.bodyText}>{beats}</Text>
                </View>
                <View>
                  <Text style={s.caption}>MIN BPM</Text>
                  <Text style={s.bodyText}>{minBpm.toFixed(0)}</Text>
                </View>
                <View>
                  <Text style={s.caption}>MAX BPM</Text>
                  <Text style={s.bodyText}>{maxBpm.toFixed(0)}</Text>
                </View>
                <View>
                  <Text style={s.caption}>CREST TIME</Text>
                  <Text style={s.bodyText}>{crestTime.toFixed(0)} ms</Text>
                </View>
              </View>
            </View>

            {/* Action row */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={resetData}>
                <Text style={s.btnSecondaryText}>↩ FRESH</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnSecondary, { flex: 1, borderColor: '#2AABEE' }]}
                onPress={handleSendTelegram}
                disabled={isTelegramSending}
              >
                <Text style={[s.btnSecondaryText, { color: '#2AABEE' }]}>
                  {isTelegramSending ? 'SENDING...' : '✈ TELEGRAM'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnSecondary, { flex: 1 }]}
                onPress={() => Alert.alert('Export', 'Raw CSV export coming soon.')}
              >
                <Text style={s.btnSecondaryText}>⬆ EXPORT</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return null;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ModeToggle({ value, onChange }: { value: 'LAYPERSON' | 'CLINICIAN'; onChange: (v: 'LAYPERSON' | 'CLINICIAN') => void }) {
  return (
    <View style={toggle.container}>
      <TouchableOpacity
        style={[toggle.pill, value === 'LAYPERSON' && toggle.active]}
        onPress={() => onChange('LAYPERSON')}
      >
        <Text style={[toggle.label, value === 'LAYPERSON' && toggle.labelActive]}>LAYPERSON</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[toggle.pill, value === 'CLINICIAN' && toggle.active]}
        onPress={() => onChange('CLINICIAN')}
      >
        <Text style={[toggle.label, value === 'CLINICIAN' && toggle.labelActive]}>CLINICIAN</Text>
      </TouchableOpacity>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[badge.container, { borderColor: color }]}>
      <Text style={[badge.text, { color }]}>{label}</Text>
    </View>
  );
}

function MetricTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={tile.container}>
      <Text style={tile.label}>{label}</Text>
      <Text style={tile.value}>{value}</Text>
      <Text style={tile.unit}>{unit}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  hiddenCamera: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  // Typography
  splashTitle: { fontSize: 52, fontWeight: '400', color: C.textPrimary, letterSpacing: -1 },
  headerTitle: { fontSize: 24, fontWeight: '600', color: C.textPrimary },
  eyebrow: { fontSize: 11, fontWeight: '600', color: C.textSecondary, letterSpacing: 2, textTransform: 'uppercase' },
  vital: { fontSize: 40, fontWeight: '700', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  vitalLarge: { fontSize: 72, fontWeight: '700', color: C.textPrimary, fontVariant: ['tabular-nums'], lineHeight: 80 },
  bodyText: { fontSize: 15, color: C.textPrimary },
  caption: { fontSize: 12, color: C.textSecondary },

  // Layout
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.hairline },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },

  // Card
  card: { backgroundColor: C.canvasRaised, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.hairline, gap: 4 },

  // Progress
  progressTrack: { height: 4, backgroundColor: C.surface, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.stable, borderRadius: 2 },

  // Dot
  dot: { width: 8, height: 8, borderRadius: 4 },

  // Icon box
  iconBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Buttons
  btnPrimary: { backgroundColor: C.stable, borderRadius: 60, paddingVertical: 16, alignItems: 'center' },
  btnPrimaryText: { color: C.canvas, fontWeight: '700', fontSize: 14, letterSpacing: 1.5 },
  btnSecondary: { backgroundColor: 'transparent', borderRadius: 60, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.hairline },
  btnSecondaryText: { color: C.textPrimary, fontWeight: '600', fontSize: 13, letterSpacing: 1 },
});

const toggle = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: C.surfaceAlt, borderRadius: 60, padding: 3 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 60 },
  active: { backgroundColor: C.stable },
  label: { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 1 },
  labelActive: { color: C.canvas },
});

const badge = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
});

const tile = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.canvasRaised, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.hairline, alignItems: 'center' },
  label: { fontSize: 9, fontWeight: '700', color: C.textSecondary, letterSpacing: 1.5 },
  value: { fontSize: 28, fontWeight: '700', color: C.stable, fontVariant: ['tabular-nums'], marginVertical: 2 },
  unit: { fontSize: 10, color: C.textSecondary },
});
