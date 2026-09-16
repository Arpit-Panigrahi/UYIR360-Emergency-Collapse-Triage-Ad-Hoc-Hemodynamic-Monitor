package com.anonymous.khunChosepseudonameonly.highspeed

import org.apache.commons.math3.complex.Complex
import org.apache.commons.math3.transform.DftNormalization
import org.apache.commons.math3.transform.FastFourierTransformer
import org.apache.commons.math3.transform.TransformType
import org.apache.commons.math3.analysis.interpolation.SplineInterpolator
import kotlin.math.*

object SciPy {

    // Simple diff
    fun diff(x: DoubleArray): DoubleArray {
        if (x.size < 2) return DoubleArray(0)
        return DoubleArray(x.size - 1) { i -> x[i + 1] - x[i] }
    }

    // Detrend (linear)
    fun detrend(y: DoubleArray): DoubleArray {
        val n = y.size
        if (n < 2) return y.clone()
        var sumX = 0.0
        var sumY = 0.0
        var sumXY = 0.0
        var sumXX = 0.0
        for (i in 0 until n) {
            val x = i.toDouble()
            sumX += x
            sumY += y[i]
            sumXY += x * y[i]
            sumXX += x * x
        }
        val slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
        val intercept = (sumY - slope * sumX) / n
        
        return DoubleArray(n) { i -> y[i] - (slope * i + intercept) }
    }

    // Zero-phase filter (filtfilt) approximation using moving average for bandpass
    // A true Butterworth filtfilt is very complex to write from scratch without a DSP lib.
    // However, for POS we can just use FFT to filter strictly in the frequency domain!
    // Since we need EXACT zero-phase filtering and want to avoid IIR state matrices, FFT filtering is perfectly zero-phase.
    fun fftBandpass(signal: DoubleArray, fs: Double, lowFreq: Double, highFreq: Double): DoubleArray {
        val n = signal.size
        // zero-pad to next power of 2
        val nextPow2 = 2.0.pow(ceil(log2(n.toDouble()))).toInt()
        val padded = DoubleArray(nextPow2)
        System.arraycopy(signal, 0, padded, 0, n)
        
        val transformer = FastFourierTransformer(DftNormalization.STANDARD)
        val complexSignal = transformer.transform(padded, TransformType.FORWARD)
        
        for (i in 0 until nextPow2) {
            val freq = i * fs / nextPow2
            if (i <= nextPow2 / 2) {
                if (freq < lowFreq || freq > highFreq) {
                    complexSignal[i] = Complex.ZERO
                }
            } else {
                val mirrorFreq = (nextPow2 - i) * fs / nextPow2
                if (mirrorFreq < lowFreq || mirrorFreq > highFreq) {
                    complexSignal[i] = Complex.ZERO
                }
            }
        }
        
        val inverse = transformer.transform(complexSignal, TransformType.INVERSE)
        val result = DoubleArray(n)
        for (i in 0 until n) {
            result[i] = inverse[i].real
        }
        return result
    }
    
    // Find peaks mimicking scipy.signal.find_peaks
    fun findPeaks(x: DoubleArray, distance: Int, prominence: Double): IntArray {
        val peaks = mutableListOf<Int>()
        for (i in 1 until x.size - 1) {
            if (x[i] > x[i - 1] && x[i] > x[i + 1]) {
                peaks.add(i)
            }
        }

        // Prominence filter
        val prominentPeaks = mutableListOf<Int>()
        for (p in peaks) {
            var leftMin = x[p]
            for (i in p - 1 downTo 0) {
                if (x[i] > x[p]) break
                if (x[i] < leftMin) leftMin = x[i]
            }
            var rightMin = x[p]
            for (i in p + 1 until x.size) {
                if (x[i] > x[p]) break
                if (x[i] < rightMin) rightMin = x[i]
            }
            val prm = x[p] - max(leftMin, rightMin)
            if (prm >= prominence) {
                prominentPeaks.add(p)
            }
        }

        // Distance filter
        val sortedPeaks = prominentPeaks.sortedByDescending { x[it] }
        val kept = BooleanArray(x.size) { false }
        for (p in sortedPeaks) {
            var tooClose = false
            for (i in max(0, p - distance)..min(x.size - 1, p + distance)) {
                if (kept[i]) {
                    tooClose = true
                    break
                }
            }
            if (!tooClose) kept[p] = true
        }

        val finalPeaks = mutableListOf<Int>()
        for (i in x.indices) {
            if (kept[i]) finalPeaks.add(i)
        }
        return finalPeaks.toIntArray()
    }

    fun findTroughs(x: DoubleArray, distance: Int, prominence: Double): IntArray {
        val inverted = DoubleArray(x.size) { -x[it] }
        return findPeaks(inverted, distance, prominence)
    }

    // Welch PSD using FFT over overlapping segments
    fun welch(x: DoubleArray, fs: Double, nperseg: Int): Pair<DoubleArray, DoubleArray> {
        require(x.size >= 4 && nperseg >= 4) { "FAIL FAST: Signal too short for Welch PSD" }
        val step = nperseg / 2

        val nextPow2 = 2.0.pow(ceil(log2(nperseg.toDouble()))).toInt()
        val window = DoubleArray(nperseg) { i ->
            // Hann window
            0.5 * (1 - cos(2 * Math.PI * i / (nperseg - 1)))
        }
        
        var numSegments = 0
        val sumPsd = DoubleArray(nextPow2 / 2 + 1)
        
        val transformer = FastFourierTransformer(DftNormalization.STANDARD)
        var start = 0
        while (start + nperseg <= x.size) {
            val segment = DoubleArray(nextPow2)
            for (i in 0 until nperseg) {
                segment[i] = x[start + i] * window[i]
            }
            val complex = transformer.transform(segment, TransformType.FORWARD)
            for (i in sumPsd.indices) {
                var power = complex[i].abs().pow(2)
                if (i > 0 && i < sumPsd.size - 1) power *= 2.0
                sumPsd[i] += power
            }
            numSegments++
            start += step
        }
        
        val freqs = DoubleArray(sumPsd.size) { i -> i * fs / nextPow2 }
        for (i in sumPsd.indices) {
            sumPsd[i] /= (numSegments * fs) // normalization approx
        }
        
        return Pair(freqs, sumPsd)
    }

    fun trapezoid(y: DoubleArray, x: DoubleArray): Double {
        var sum = 0.0
        for (i in 0 until y.size - 1) {
            sum += 0.5 * (y[i] + y[i+1]) * (x[i+1] - x[i])
        }
        return sum
    }
}
