export function calculateDSPStats(frames: any[], filterParams: any) {
    if (!frames || frames.length === 0) return null;

    const fps = 30; // 30 FPS extracted by the TextureView sampler

    const r = frames.map(f => f.r);
    const g = frames.map(f => f.g);
    const b = frames.map(f => f.b);

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length);
    const median = (arr: number[]) => {
        const s = [...arr].sort((a,b)=>a-b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    // ── 1. POS Algorithm: windowed local normalization (matches Python cuda_compute_pos_signal) ──
    // Python uses a sliding window mean of fps*1.5 frames, not global DC
    const winLen = Math.max(Math.round(fps * 1.5), 10);

    // Compute sliding window mean for each channel
    const slidingMean = (arr: number[]) => {
        const out = new Array(arr.length);
        for (let i = 0; i < arr.length; i++) {
            let sum = 0, count = 0;
            for (let j = Math.max(0, i - Math.floor(winLen / 2)); j < Math.min(arr.length, i + Math.floor(winLen / 2) + 1); j++) {
                sum += arr[j]; count++;
            }
            out[i] = sum / count + 1e-6;
        }
        return out;
    };

    const rMean = slidingMean(r);
    const gMean = slidingMean(g);
    const bMean = slidingMean(b);

    const rNorm = r.map((v, i) => v / rMean[i]);
    const gNorm = g.map((v, i) => v / gMean[i]);
    const bNorm = b.map((v, i) => v / bMean[i]);

    const S1: number[] = gNorm.map((v, i) => v - bNorm[i]);
    const S2: number[] = gNorm.map((v, i) => v + bNorm[i] - 2 * rNorm[i]);

    const mS1 = mean(S1), mS2 = mean(S2);
    const stdS1 = std(S1, mS1), stdS2 = std(S2, mS2);
    const alpha = stdS1 / (stdS2 + 1e-6);
    const posRaw = S1.map((s, i) => s + alpha * S2[i]);

    // ── 2. Detrend (linear, matches Python signal.detrend) ──
    const n = posRaw.length;
    const xs = Array.from({ length: n }, (_, i) => i);
    const xMean = (n - 1) / 2;
    const yMean = mean(posRaw);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (posRaw[i] - yMean); den += (xs[i] - xMean) ** 2; }
    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;
    const detrended = posRaw.map((v, i) => v - (slope * i + intercept));

    // ── 3. Bandpass filter via filterParams (0.75–3.5 Hz ~ 45–210 BPM) ──
    const filtered: number[] = filterParams ? filterParams.multiStep(detrended) : detrended;

    // ── 4. Normalize (matches Python: subtract mean, divide by std) ──
    const fMean = mean(filtered);
    const fStd = std(filtered, fMean);
    const normalized = filtered.map(v => (v - fMean) / (fStd + 1e-6));

    // ── 5. Spectral BPM via FFT (matches Python Welch peak freq) ──
    // Simple FFT magnitude — find dominant frequency in 45–210 BPM band
    const fftSize = nextPow2(normalized.length);
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < normalized.length; i++) re[i] = normalized[i];
    fft(re, im, fftSize);
    const lowBin = Math.ceil((45 / 60) * fftSize / fps);
    const highBin = Math.floor((210 / 60) * fftSize / fps);
    let peakBin = lowBin, peakPow = -Infinity;
    for (let k = lowBin; k <= Math.min(highBin, fftSize / 2); k++) {
        const pow = re[k] * re[k] + im[k] * im[k];
        if (pow > peakPow) { peakPow = pow; peakBin = k; }
    }
    const spectralBpm = (peakBin * fps / fftSize) * 60;

    // ── 6. Peak detection with prominence & min distance (matches Python) ──
    // min distance = fps * 60 / (210 * 1.15)
    const minDist = Math.max(Math.round(fps * 60.0 / (210 * 1.15)), 1);
    const prominence = 0.3;
    const rawPeaks: number[] = [];
    for (let i = 1; i < normalized.length - 1; i++) {
        if (normalized[i] > normalized[i - 1] && normalized[i] > normalized[i + 1]) {
            rawPeaks.push(i);
        }
    }
    // Enforce min distance
    const peaks: number[] = [];
    let lastPeak = -minDist - 1;
    for (const p of rawPeaks) {
        if (p - lastPeak >= minDist) {
            // Simple prominence: value must exceed neighbors within minDist window
            const leftMin = Math.min(...normalized.slice(Math.max(0, p - minDist), p));
            const rightMin = Math.min(...normalized.slice(p + 1, Math.min(normalized.length, p + minDist + 1)));
            if (normalized[p] - Math.max(leftMin, rightMin) >= prominence) {
                peaks.push(p);
                lastPeak = p;
            }
        }
    }

    if (peaks.length < 2) return null;

    // ── 7. IBI with validity mask (matches Python: 60/210 ≤ ibi ≤ 60/45) ──
    const peakTimesSec = peaks.map(p => p / fps);
    const ibisRaw = peakTimesSec.slice(1).map((t, i) => t - peakTimesSec[i]);
    const validIbis = ibisRaw.filter(ibi => ibi >= 60 / 210 && ibi <= 60 / 45);

    if (validIbis.length === 0) return null;

    const ibisMs = validIbis.map(s => s * 1000);
    const instBpm = validIbis.map(s => 60 / s);

    const meanBpm = mean(instBpm);
    const medBpm = median(instBpm);
    const minBpm = Math.min(...instBpm);
    const maxBpm = Math.max(...instBpm);

    const meanIbi = mean(ibisMs);
    const sdnn = std(ibisMs, meanIbi);

    const diffs: number[] = [];
    for (let i = 1; i < ibisMs.length; i++) diffs.push(Math.abs(ibisMs[i] - ibisMs[i-1]));

    const rmssd = diffs.length > 0 ? Math.sqrt(mean(diffs.map(d => d * d))) : 0;
    const pnn50 = diffs.length > 0 ? (diffs.filter(d => d > 50).length / diffs.length) * 100 : 0;
    const pnn20 = diffs.length > 0 ? (diffs.filter(d => d > 20).length / diffs.length) * 100 : 0;

    // Poincare SD1 SD2
    const varDiff = diffs.length > 0 ? std(diffs, mean(diffs)) ** 2 : 0;
    const varIbi = sdnn ** 2;
    const sd1 = Math.sqrt(0.5 * varDiff);
    const sd2 = Math.sqrt(Math.max(0, 2 * varIbi - 0.5 * varDiff));
    const sdRatio = sd1 / (sd2 + 1e-6);

    const lfHfRatio = Math.max(0.1, Math.pow(sd2 / sd1, 2) * 0.1);
    const lfPower = (varIbi * 0.4) * lfHfRatio;
    const hfPower = (varIbi * 0.4);

    // ── 8. Respiration Rate ──
    let respPeaks = 0;
    let lastRespPeak = -100;
    const smoothedG: number[] = [];
    for (let i = 0; i < g.length; i++) {
        let sum = 0, count = 0;
        for (let j = Math.max(0, i - 15); j < Math.min(g.length, i + 15); j++) { sum += g[j]; count++; }
        smoothedG.push(sum / count);
    }
    for (let i = 1; i < smoothedG.length - 1; i++) {
        if (smoothedG[i] > smoothedG[i - 1] && smoothedG[i] > smoothedG[i + 1]) {
            if (i - lastRespPeak > 60) { respPeaks++; lastRespPeak = i; }
        }
    }
    const respRate = (respPeaks / (g.length / fps)) * 60;

    // ── 9. SpO2 & Perfusion Index (global DC for these is fine) ──
    const rDc = mean(r) || 1, gDc = mean(g) || 1;
    const rAc = std(r, rDc), gAc = std(g, gDc);
    const piR = (rAc / rDc) * 100;
    const piG = (gAc / gDc) * 100;
    const ratioOfRatios = (rAc / rDc) / (gAc / gDc + 1e-6);
    const spo2 = Math.min(100, Math.max(85, 110.0 - 25.0 * ratioOfRatios));

    // ── 10. Crest Time ──
    const feet: number[] = [];
    for (let i = 1; i < normalized.length - 1; i++) {
        if (normalized[i] < normalized[i - 1] && normalized[i] < normalized[i + 1]) feet.push(i);
    }
    const crestTimesMs: number[] = [];
    for (const p of peaks) {
        const prevFeet = feet.filter(f => f < p);
        if (prevFeet.length > 0) {
            const foot = prevFeet[prevFeet.length - 1];
            const ct = ((p - foot) / fps) * 1000;
            if (ct >= 40 && ct <= 300) crestTimesMs.push(ct);
        }
    }
    const crestTime = crestTimesMs.length > 0 ? mean(crestTimesMs) : 120;

    return {
        cardio: {
            spectralBpm,
            meanBpm, medBpm, minBpm, maxBpm,
            beats: peaks.length
        },
        hrvTime: { meanIbi, sdnn, rmssd, pnn50, pnn20 },
        hrvFreq: { lfPower, hfPower, lfHfRatio },
        hrvNonlinear: { sd1, sd2, sdRatio },
        respiration: respRate,
        hemo: { spo2, piG, piR, crestTime }
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

/** In-place Cooley-Tukey FFT */
function fft(re: Float64Array, im: Float64Array, n: number) {
    // Bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    // FFT butterfly
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len;
        const wRe = Math.cos(ang), wIm = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let curRe = 1, curIm = 0;
            for (let j = 0; j < len / 2; j++) {
                const uRe = re[i + j], uIm = im[i + j];
                const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
                const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
                re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
                re[i + j + len / 2] = uRe - vRe; im[i + j + len / 2] = uIm - vIm;
                const newRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = newRe;
            }
        }
    }
}
