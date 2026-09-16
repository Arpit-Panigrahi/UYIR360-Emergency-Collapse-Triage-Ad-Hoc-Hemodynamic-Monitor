package com.anonymous.khunChosepseudonameonly.highspeed

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.apache.commons.math3.analysis.interpolation.SplineInterpolator
import kotlin.math.*

object AdvancedBiomarkers {
    fun extract(
        r: DoubleArray,
        g: DoubleArray,
        b: DoubleArray,
        fps: Double
    ): WritableMap {
        val n = r.size
        
        // 1. Sliding Window POS
        val winLen = max((fps * 1.5).toInt(), 10)
        val rMean = movingAverage(r, winLen)
        val gMean = movingAverage(g, winLen)
        val bMean = movingAverage(b, winLen)

        val s1 = DoubleArray(n)
        val s2 = DoubleArray(n)
        for (i in 0 until n) {
            val rNorm = r[i] / (rMean[i] + 1e-6)
            val gNorm = g[i] / (gMean[i] + 1e-6)
            val bNorm = b[i] / (bMean[i] + 1e-6)
            s1[i] = gNorm - bNorm
            s2[i] = gNorm + bNorm - 2.0 * rNorm
        }

        val stdS1 = std(s1)
        val stdS2 = std(s2)
        val alpha = stdS1 / (stdS2 + 1e-6)

        val posSignal = DoubleArray(n) { i -> s1[i] + alpha * s2[i] }
        val detrended = SciPy.detrend(posSignal)

        // Bandpass 0.75 - 3.5 Hz
        var pulseWave = SciPy.fftBandpass(detrended, fps, 0.75, 3.5)
        
        // Normalize
        val pwMean = mean(pulseWave)
        val pwStd = std(pulseWave)
        for (i in 0 until n) pulseWave[i] = (pulseWave[i] - pwMean) / (pwStd + 1e-6)

        // Peaks
        val minPeakDist = max((fps * 60.0 / 220.0).toInt(), 1)
        val peaks = SciPy.findPeaks(pulseWave, minPeakDist, 0.35)
        val feet = SciPy.findTroughs(pulseWave, minPeakDist, 0.35)

        val validIbisMs = mutableListOf<Double>()
        val validIbisSec = mutableListOf<Double>()
        for (i in 1 until peaks.size) {
            val ibi = (peaks[i] - peaks[i-1]) / fps
            if (ibi in 0.28..1.4) {
                validIbisSec.add(ibi)
                validIbisMs.add(ibi * 1000.0)
            }
        }

        // Spectral HR
        val (freqs, psd) = SciPy.welch(pulseWave, fps, min(pulseWave.size, (fps * 10).toInt()))
        var maxPsd = -1.0
        var spectralBpm = 0.0
        for (i in freqs.indices) {
            if (freqs[i] in 0.75..3.5) {
                if (psd[i] > maxPsd) {
                    maxPsd = psd[i]
                    spectralBpm = freqs[i] * 60.0
                }
            }
        }

        var meanBpm = spectralBpm
        var medianBpm = spectralBpm
        var minBpm = spectralBpm
        var maxBpm = spectralBpm
        var sdnn = 0.0
        var rmssd = 0.0
        var pnn50 = 0.0
        var pnn20 = 0.0
        var meanIbi = 0.0
        
        var sd1 = 0.0
        var sd2 = 0.0
        var sdRatio = 0.0

        if (validIbisSec.isNotEmpty()) {
            val bpms = validIbisSec.map { 60.0 / it }.sorted()
            meanBpm = bpms.average()
            medianBpm = bpms[bpms.size / 2]
            minBpm = bpms.first()
            maxBpm = bpms.last()
            
            meanIbi = validIbisMs.average()
            sdnn = std(validIbisMs.toDoubleArray())
            
            val diffs = SciPy.diff(validIbisMs.toDoubleArray())
            val sqDiffs = diffs.map { it * it }.toDoubleArray()
            rmssd = sqrt(mean(sqDiffs))
            
            pnn50 = (diffs.count { abs(it) > 50.0 } / diffs.size.toDouble()) * 100.0
            pnn20 = (diffs.count { abs(it) > 20.0 } / diffs.size.toDouble()) * 100.0

            if (validIbisMs.size > 3) {
                val xN = validIbisMs.dropLast(1).toDoubleArray()
                val xN1 = validIbisMs.drop(1).toDoubleArray()
                val diffNN = DoubleArray(xN.size) { i -> xN[i] - xN1[i] }
                
                val varDiff = std(diffNN).pow(2)
                val varXn = std(xN).pow(2)
                
                sd1 = sqrt(0.5 * varDiff)
                sd2 = sqrt(2.0 * varXn - 0.5 * varDiff)
                sdRatio = sd1 / (sd2 + 1e-6)
            }
        }

        // HRV Freq Domain
        var lfPower = 0.0
        var hfPower = 0.0
        var lfHfRatio = 0.0
        
        if (validIbisSec.size > 4) {
            val times = DoubleArray(validIbisSec.size)
            var c = 0.0
            for (i in validIbisSec.indices) {
                c += validIbisSec[i]
                times[i] = c
            }
            
            val tUniform = DoubleArray((times.last() * 4.0).toInt()) { i -> times.first() + i * 0.25 }
            if (tUniform.size > 4) {
                val interpolator = SplineInterpolator()
                val spline = interpolator.interpolate(times, validIbisMs.toDoubleArray())
                val ibiUniform = DoubleArray(tUniform.size) { i ->
                    // cap extrapolation
                    var t = tUniform[i]
                    if (t < times.first()) t = times.first()
                    if (t > times.last()) t = times.last()
                    spline.value(t)
                }
                
                val ibiDetrended = SciPy.detrend(ibiUniform)
                val (hFreqs, hPsd) = SciPy.welch(ibiDetrended, 4.0, min(ibiDetrended.size, 64))
                
                val lfFreqs = mutableListOf<Double>()
                val lfPsd = mutableListOf<Double>()
                val hfFreqs = mutableListOf<Double>()
                val hfPsd = mutableListOf<Double>()
                
                for (i in hFreqs.indices) {
                    if (hFreqs[i] in 0.04..0.15) { lfFreqs.add(hFreqs[i]); lfPsd.add(hPsd[i]) }
                    if (hFreqs[i] in 0.15..0.40) { hfFreqs.add(hFreqs[i]); hfPsd.add(hPsd[i]) }
                }
                
                lfPower = SciPy.trapezoid(lfPsd.toDoubleArray(), lfFreqs.toDoubleArray())
                hfPower = SciPy.trapezoid(hfPsd.toDoubleArray(), hfFreqs.toDoubleArray())
                lfHfRatio = lfPower / (hfPower + 1e-6)
            }
        }

        // Respiration
        val respSignal = SciPy.fftBandpass(detrended, fps, 0.1, 0.5)
        val (rFreqs, rPsd) = SciPy.welch(respSignal, fps, min(respSignal.size, (fps * 16).toInt()))
        var maxRPsd = -1.0
        var respFreq = 0.25
        for (i in rFreqs.indices) {
            if (rFreqs[i] in 0.1..0.5) {
                if (rPsd[i] > maxRPsd) {
                    maxRPsd = rPsd[i]
                    respFreq = rFreqs[i]
                }
            }
        }
        val respRate = respFreq * 60.0

        // Hemodynamics
        val rAc = std(r)
        val rDc = mean(r) + 1e-6
        val gAc = std(g)
        val gDc = mean(g) + 1e-6
        val bAc = std(b)
        val bDc = mean(b) + 1e-6

        val piR = (rAc / rDc) * 100.0
        val piG = (gAc / gDc) * 100.0
        val ror = (rAc / rDc) / (gAc / gDc + 1e-6)
        val spo2 = max(85.0, min(100.0, 110.0 - 25.0 * ror))

        val crests = mutableListOf<Double>()
        for (p in peaks) {
            var foot = -1
            for (f in feet) {
                if (f < p) foot = f
                else break
            }
            if (foot != -1) {
                val ct = (p - foot) / fps * 1000.0
                if (ct in 40.0..300.0) crests.add(ct)
            }
        }
        val crestTime = if (crests.isNotEmpty()) crests.average() else 120.0

        val map = Arguments.createMap()
        
        val cardio = Arguments.createMap()
        cardio.putDouble("spectralBpm", spectralBpm)
        cardio.putDouble("meanBpm", meanBpm)
        cardio.putDouble("medBpm", medianBpm)
        cardio.putDouble("minBpm", minBpm)
        cardio.putDouble("maxBpm", maxBpm)
        cardio.putDouble("beats", peaks.size.toDouble())
        map.putMap("cardio", cardio)

        val hrvTime = Arguments.createMap()
        hrvTime.putDouble("meanIbi", meanIbi)
        hrvTime.putDouble("sdnn", sdnn)
        hrvTime.putDouble("rmssd", rmssd)
        hrvTime.putDouble("pnn50", pnn50)
        hrvTime.putDouble("pnn20", pnn20)
        map.putMap("hrvTime", hrvTime)

        val hrvFreq = Arguments.createMap()
        hrvFreq.putDouble("lfPower", lfPower)
        hrvFreq.putDouble("hfPower", hfPower)
        hrvFreq.putDouble("lfHfRatio", lfHfRatio)
        map.putMap("hrvFreq", hrvFreq)

        val hrvNonlinear = Arguments.createMap()
        hrvNonlinear.putDouble("sd1", sd1)
        hrvNonlinear.putDouble("sd2", sd2)
        hrvNonlinear.putDouble("sdRatio", sdRatio)
        map.putMap("hrvNonlinear", hrvNonlinear)

        map.putDouble("respiration", respRate)

        val hemo = Arguments.createMap()
        hemo.putDouble("spo2", spo2)
        hemo.putDouble("piG", piG)
        hemo.putDouble("piR", piR)
        hemo.putDouble("crestTime", crestTime)
        map.putMap("hemo", hemo)
        
        return map
    }

    private fun movingAverage(arr: DoubleArray, w: Int): DoubleArray {
        val out = DoubleArray(arr.size)
        val pad = w / 2
        for (i in arr.indices) {
            var sum = 0.0
            var count = 0
            for (j in max(0, i - pad)..min(arr.size - 1, i + pad)) {
                sum += arr[j]
                count++
            }
            out[i] = sum / count
        }
        return out
    }

    private fun mean(arr: DoubleArray): Double {
        if (arr.isEmpty()) return 0.0
        return arr.sum() / arr.size
    }

    private fun std(arr: DoubleArray): Double {
        if (arr.isEmpty()) return 0.0
        val m = mean(arr)
        var sum = 0.0
        for (v in arr) sum += (v - m) * (v - m)
        return sqrt(sum / (arr.size - 1)) // ddof=1
    }
}
