package com.anonymous.khunChosepseudonameonly.highspeed

import android.media.Image
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import kotlin.math.max

object OfflineVideoProcessor {
    private const val TAG = "OfflineVideoProcessor"

    fun processVideo(path: String, onProgress: (Int) -> Unit): Map<String, DoubleArray>? {
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(path)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to extract video: $path", e)
            return null
        }

        var trackIndex = -1
        var format: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val f = extractor.getTrackFormat(i)
            val mime = f.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("video/")) {
                trackIndex = i
                format = f
                break
            }
        }

        if (trackIndex < 0 || format == null) {
            Log.e(TAG, "No video track found")
            extractor.release()
            return null
        }

        extractor.selectTrack(trackIndex)
        val width = format.getInteger(MediaFormat.KEY_WIDTH)
        val height = format.getInteger(MediaFormat.KEY_HEIGHT)
        val frameCount = if (format.containsKey("frame-count")) format.getInteger("frame-count") else 10800

        val rList = mutableListOf<Double>()
        val gList = mutableListOf<Double>()
        val bList = mutableListOf<Double>()
        val tList = mutableListOf<Double>()

        val hStart = height / 4
        val hEnd = (3 * height) / 4
        val wStart = width / 4
        val wEnd = (3 * width) / 4

        val mime = format.getString(MediaFormat.KEY_MIME)!!
        val decoder = MediaCodec.createDecoderByType(mime)
        
        // Configure decoder to output COLOR_FormatYUV420Flexible into ByteBuffers directly
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT, android.media.MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
        decoder.configure(format, null, null, 0)
        decoder.start()

        val info = MediaCodec.BufferInfo()
        var isEOS = false
        var outputEOS = false
        var framesProcessed = 0
        
        val timeoutUs = 10000L


        var loopTimeoutCounter = 0
        try {
            while (!outputEOS && loopTimeoutCounter < 500) {
                var madeProgress = false
                if (!isEOS) {
                    val inIndex = decoder.dequeueInputBuffer(timeoutUs)
                    if (inIndex >= 0) {
                        madeProgress = true
                        val buffer = decoder.getInputBuffer(inIndex)!!
                        val sampleSize = extractor.readSampleData(buffer, 0)
                        if (sampleSize < 0) {
                            decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            isEOS = true
                        } else {
                            decoder.queueInputBuffer(inIndex, 0, sampleSize, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }

                val outIndex = decoder.dequeueOutputBuffer(info, timeoutUs)
                if (outIndex >= 0) {
                    madeProgress = true
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        outputEOS = true
                    }

                    if (info.size != 0) {
                        val image = decoder.getOutputImage(outIndex)
                        if (image != null) {
                            processYUV(image, rList, gList, bList, hStart, hEnd, wStart, wEnd)
                            tList.add(info.presentationTimeUs / 1000000.0)
                            image.close()
                            framesProcessed++
                            if (framesProcessed % 100 == 0) {
                                onProgress((framesProcessed.toFloat() / max(1, frameCount) * 100).toInt())
                            }
                        }
                    }
                    decoder.releaseOutputBuffer(outIndex, false)
                } else if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    madeProgress = true
                    Log.d(TAG, "Decoder format changed: ${decoder.outputFormat}")
                }
                
                if (!madeProgress) {
                    loopTimeoutCounter++
                } else {
                    loopTimeoutCounter = 0
                }
            }
            if (loopTimeoutCounter >= 500) {
                throw RuntimeException("FAIL FAST: Decoder hung/stuck in infinite loop.")
            }
        }
 catch (e: Exception) {
            Log.e(TAG, "Decoding exception", e)
        } finally {
            try { decoder.stop() } catch (e: Exception) {}
            try { decoder.release() } catch (e: Exception) {}
            try { extractor.release() } catch (e: Exception) {}
        }


        if (rList.isEmpty()) {
            throw RuntimeException("FAIL FAST: No frames decoded.")
        }
        
        val actualDuration = (tList.last() - tList.first())
        val actualFps = framesProcessed / actualDuration
        Log.i(TAG, "Offline extraction complete. Frames: $framesProcessed, Duration: $actualDuration, FPS: $actualFps")
        
        if (actualFps < 90.0) {
            throw RuntimeException("FAIL FAST: Video recording dropped below 90 FPS. Actual FPS was $actualFps")
        }

        Log.i(TAG, "Finished offline extraction. Processed \$framesProcessed frames.")
        return mapOf(
            "r" to rList.toDoubleArray(),
            "g" to gList.toDoubleArray(),
            "b" to bList.toDoubleArray(),
            "t" to tList.toDoubleArray()
        )
    }

    private fun processYUV(
        image: Image,
        rList: MutableList<Double>,
        gList: MutableList<Double>,
        bList: MutableList<Double>,
        hStart: Int, hEnd: Int, wStart: Int, wEnd: Int
    ) {
        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]

        val yBuffer = yPlane.buffer
        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer

        val yRowStride = yPlane.rowStride
        val yPixelStride = yPlane.pixelStride
        val uvRowStride = uPlane.rowStride
        val uvPixelStride = uPlane.pixelStride

        var localSumR = 0.0
        var localSumG = 0.0
        var localSumB = 0.0
        var localCount = 0.0

        var fallbackSumR = 0.0
        var fallbackSumG = 0.0
        var fallbackSumB = 0.0
        var fallbackCount = 0.0

        val w = image.width
        val h = image.height

        for (row in 0 until h step 2) {
            for (col in 0 until w step 2) {
                // Downsample by 2x for speed (process 2x2 blocks as 1 pixel)
                val yIdx = row * yRowStride + col * yPixelStride
                val uvIdx = (row / 2) * uvRowStride + (col / 2) * uvPixelStride

                if (yIdx >= yBuffer.capacity() || uvIdx >= uBuffer.capacity() || uvIdx >= vBuffer.capacity()) {
                    continue
                }

                val y = (yBuffer.get(yIdx).toInt() and 0xFF).toDouble()
                val u = (uBuffer.get(uvIdx).toInt() and 0xFF).toDouble()
                val v = (vBuffer.get(uvIdx).toInt() and 0xFF).toDouble()

                // YUV to RGB (Rec 601)
                val rVal = y + 1.402 * (v - 128)
                val gVal = y - 0.344136 * (u - 128) - 0.714136 * (v - 128)
                val bVal = y + 1.772 * (u - 128)

                val r = max(0.0, kotlin.math.min(255.0, rVal))
                val g = max(0.0, kotlin.math.min(255.0, gVal))
                val b = max(0.0, kotlin.math.min(255.0, bVal))

                if (row in hStart until hEnd && col in wStart until wEnd) {
                    fallbackSumR += r
                    fallbackSumG += g
                    fallbackSumB += b
                    fallbackCount += 1.0
                }

                // YCrCb Skin segmentation
                val cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128.0
                val cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128.0

                if (cr in 133.0..173.0 && cb in 77.0..127.0) {
                    localSumR += r
                    localSumG += g
                    localSumB += b
                    localCount += 1.0
                }
            }
        }

        if (localCount > (w * h) * 0.05 / 4.0) { // Require at least 5% of pixels to be skin
            rList.add(localSumR / localCount)
            gList.add(localSumG / localCount)
            bList.add(localSumB / localCount)
        } else {
            rList.add(fallbackSumR / max(1.0, fallbackCount))
            gList.add(fallbackSumG / max(1.0, fallbackCount))
            bList.add(fallbackSumB / max(1.0, fallbackCount))
        }
    }
}
