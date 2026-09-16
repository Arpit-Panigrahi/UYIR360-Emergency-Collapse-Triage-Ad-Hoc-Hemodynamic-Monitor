package com.anonymous.khunChosepseudonameonly.highspeed

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.events.RCTEventEmitter
import android.graphics.SurfaceTexture
import android.hardware.camera2.*
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Range
import android.util.Size
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import com.facebook.react.uimanager.ThemedReactContext

@SuppressLint("MissingPermission")
class HighSpeedCameraView @JvmOverloads constructor(
    context: Context,
    attrs: android.util.AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr), TextureView.SurfaceTextureListener {

    private val TAG = "HighSpeedCam"

    private var textureView: TextureView
    private var cameraManager: CameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null

    private var backgroundThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null

    private var mediaRecorder: MediaRecorder? = null
    private var isRecording = false
    private var videoPath: String? = null

    private val frameBuffer = mutableListOf<Map<String, Any>>()
    private val reactContext = context as ThemedReactContext

    private val pixelExtractionRunnable = object : Runnable {
        override fun run() {
            if (isRecording) {
                try {
                    val bitmap = textureView.getBitmap(50, 50)
                    if (bitmap != null) {
                        var sumR = 0L
                        var sumG = 0L
                        var sumB = 0L
                        for (x in 0 until 50) {
                            for (y in 0 until 50) {
                                val pixel = bitmap.getPixel(x, y)
                                sumR += Color.red(pixel)
                                sumG += Color.green(pixel)
                                sumB += Color.blue(pixel)
                            }
                        }
                        val count = 2500
                        val t = System.currentTimeMillis().toDouble()
                        frameBuffer.add(mapOf("t" to t, "r" to (sumR.toDouble()/count), "g" to (sumG.toDouble()/count), "b" to (sumB.toDouble()/count)))
                        bitmap.recycle()
                    }
                } catch(e: Exception) {}
                backgroundHandler?.postDelayed(this, 33) // ~30 fps
            }
        }
    }


    init {
        Log.d(TAG, "▶ HighSpeedCameraView INIT")
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        textureView = TextureView(context)
        textureView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        textureView.surfaceTextureListener = this
        addView(textureView)
    }

    private fun startBackgroundThread() {
        backgroundThread = HandlerThread("HighSpeedCam2Thread").apply { start() }
        backgroundHandler = Handler(backgroundThread!!.looper)
    }

    private fun stopBackgroundThread() {
        backgroundThread?.quitSafely()
        try {
            backgroundThread?.join()
            backgroundThread = null
            backgroundHandler = null
        } catch (e: InterruptedException) {}
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        startBackgroundThread()
        openCamera()
    }

    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}
    
    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        closeCamera()
        stopBackgroundThread()
        return true
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}

    private fun openCamera() {
        val cameraId = cameraManager.cameraIdList.firstOrNull { id ->
            val chars = cameraManager.getCameraCharacteristics(id)
            if (chars.get(CameraCharacteristics.LENS_FACING) != CameraCharacteristics.LENS_FACING_BACK) return@firstOrNull false
            val configs = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            configs?.highSpeedVideoSizes?.isNotEmpty() == true
        } ?: return

        cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
            override fun onOpened(camera: CameraDevice) {
                cameraDevice = camera
                startHighSpeedSession(camera)
            }
            override fun onDisconnected(camera: CameraDevice) = closeCamera()
            override fun onError(camera: CameraDevice, error: Int) = closeCamera()
        }, backgroundHandler)
    }

    private fun startHighSpeedSession(camera: CameraDevice) {
        val chars = cameraManager.getCameraCharacteristics(camera.id)
        val configs = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP) ?: return
        val sizes = configs.highSpeedVideoSizes ?: return
        
        var captureSize: Size? = null
        var fpsRange: Range<Int>? = null

        // Sort all supported high-speed sizes from smallest to largest area
        val sortedSizes = sizes.sortedBy { it.width * it.height }

        for (size in sortedSizes) {
            val ranges = configs.getHighSpeedVideoFpsRangesFor(size)
            for (range in ranges) {
                if (range.upper >= 120 && range.lower == range.upper) {
                    captureSize = size
                    fpsRange = range
                    break
                }
            }
            if (captureSize != null) break
        }

        if (captureSize == null || fpsRange == null) {
            Log.e(TAG, "No 120fps mode found on this device!")
            return
        }

        Log.d(TAG, "Selected HighSpeed Config: ${captureSize.width}x${captureSize.height} @ ${fpsRange.upper}fps")

        val texture = textureView.surfaceTexture ?: return
        texture.setDefaultBufferSize(captureSize.width, captureSize.height)
        val previewSurface = Surface(texture)

        var recordingSurface: Surface? = null
        if (isRecording && videoPath != null) {
            try {
                mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    MediaRecorder(context)
                } else {
                    MediaRecorder()
                }
                mediaRecorder?.apply {
                    setVideoSource(MediaRecorder.VideoSource.SURFACE)
                    setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                    setOutputFile(videoPath)
                    setVideoEncodingBitRate(20000000)
                    setVideoFrameRate(120)
                    setVideoSize(captureSize.width, captureSize.height)
                    setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                    prepare()
                    recordingSurface = surface
                    Log.d(TAG, "MediaRecorder prepared for 120FPS output")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to prepare MediaRecorder", e)
                isRecording = false
            }
        }

        val surfaces = mutableListOf<android.view.Surface>(previewSurface)
        if (recordingSurface != null) {
            surfaces.add(recordingSurface!!)
        }

        camera.createConstrainedHighSpeedCaptureSession(
            surfaces,
            object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    try {
                        val template = if (recordingSurface != null) CameraDevice.TEMPLATE_RECORD else CameraDevice.TEMPLATE_PREVIEW
                        val builder = camera.createCaptureRequest(template)
                        builder.addTarget(previewSurface)
                        if (recordingSurface != null) {
                            builder.addTarget(recordingSurface!!)
                        }
                        
                        builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, fpsRange)
                        builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF)
                        builder.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_OFF)
                        // Force a fast shutter (8ms) and high ISO so the framerate never drops when the finger covers the lens!
                        builder.set(CaptureRequest.SENSOR_EXPOSURE_TIME, 8000000L)
                        builder.set(CaptureRequest.SENSOR_SENSITIVITY, 800)
                        
                        val flashAvailable = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) ?: false
                        if (flashAvailable) {
                            builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_TORCH)
                        }

                        val captureCallback = object : CameraCaptureSession.CaptureCallback() {
                            private var frameCounter = 0
                            private var startTime = 0L

                            override fun onCaptureCompleted(
                                session: CameraCaptureSession,
                                request: CaptureRequest,
                                result: TotalCaptureResult
                            ) {
                                frameCounter++
                                val now = System.currentTimeMillis()
                                if (startTime == 0L) startTime = now
                                
                                if (now - startTime >= 1000) {
                                    if (isRecording) {
                                        Log.i(TAG, "⚡ RECORDING: $frameCounter FPS")
                                    } else {
                                        Log.i(TAG, "💤 PREVIEW (Standby): $frameCounter FPS")
                                    }
                                    
                                    // INSTANT FAILOVER: If HAL is secretly throttling during RECORDING, abort!
                                    if (isRecording && frameCounter < 90) {
                                        Log.e(TAG, "Hardware fell back to $frameCounter FPS. Aborting!")
                                        try {
                                            val event = Arguments.createMap()
                                            event.putString("error", "FAILOVER: Hardware throttled to $frameCounter FPS instead of 120 FPS.")
                                            reactContext.getJSModule(RCTEventEmitter::class.java)
                                                .receiveEvent(id, "onMeasurementComplete", event)
                                        } catch (e: Exception) {}
                                        stopRecording(true)
                                    }

                                    frameCounter = 0
                                    startTime = now
                                }
                            }
                        }

                        val constrainedSession = session as CameraConstrainedHighSpeedCaptureSession
                        val burstList = constrainedSession.createHighSpeedRequestList(builder.build())
                        constrainedSession.setRepeatingBurst(burstList, captureCallback, backgroundHandler)
                        
                        if (recordingSurface != null) {
                            try {
                                mediaRecorder?.start()
                                Log.d(TAG, "MediaRecorder started")
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to start MediaRecorder", e)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "✗ Exception starting burst", e)
                    }
                }
                override fun onConfigureFailed(session: CameraCaptureSession) {
                    Log.e(TAG, "HAL rejected HighSpeed configuration")
                }
            },
            backgroundHandler
        )
    }
    
    fun startRecording(path: String) {
        if (isRecording) return
        videoPath = path
        isRecording = true
        frameBuffer.clear()
        Log.d(TAG, "▶ startRecording: $path")
        closeSession()
        cameraDevice?.let { startHighSpeedSession(it) }
        backgroundHandler?.postDelayed(pixelExtractionRunnable, 500)
    }

    fun stopRecording(abort: Boolean = false) {
        if (!isRecording) return
        Log.d(TAG, "▶ stopRecording (abort=$abort)")
        isRecording = false
        backgroundHandler?.removeCallbacks(pixelExtractionRunnable)
        
        // STOP camera session FIRST to prevent writing to a stopped surface!
        try {
            captureSession?.stopRepeating()
            captureSession?.close()
            captureSession = null
        } catch(e: Exception) {}

        // Now safely stop the recorder
        try {
            mediaRecorder?.stop()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recorder", e)
        }
        try {
            mediaRecorder?.release()
            mediaRecorder = null
        } catch (e: Exception) {}
        
        if (abort) {
            Log.e(TAG, "FAIL FAST: Aborting measurement completely, discarding video.")
            val event = Arguments.createMap()
            event.putString("error", "FAIL FAST: Hardware constraints not met. Measurement aborted.")
            reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onMeasurementComplete", event)
            cameraDevice?.let { startHighSpeedSession(it) }
            return
        }

        Thread {
            try {
                val path = videoPath ?: return@Thread
                Log.i(TAG, "Starting exact Python methodology extraction on $path")
                val extracted = OfflineVideoProcessor.processVideo(path) { pct ->
                    try {
                        val progressEvent = Arguments.createMap()
                        progressEvent.putString("status", "Processing Offline: $pct%")
                        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onMeasurementComplete", progressEvent)
                    } catch(e: Exception) {}
                }
                if (extracted != null) {
                    val r = extracted["r"]!!
                    val g = extracted["g"]!!
                    val b = extracted["b"]!!
                    
                    val stats = AdvancedBiomarkers.extract(r, g, b, 120.0)
                    val event = Arguments.createMap()
                    event.putMap("stats", stats)
                    reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onMeasurementComplete", event)
                } else {
                    val event = Arguments.createMap()
                    event.putString("error", "Failed to extract video frames offline.")
                    reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onMeasurementComplete", event)
                }
            } catch(e: Exception) {
                 Log.e(TAG, "Processing error", e)
                 val event = Arguments.createMap()
                 event.putString("error", "Processing error: ${e.message}")
                 reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onMeasurementComplete", event)
            }
        }.start()
        
        // Restart preview
        cameraDevice?.let { startHighSpeedSession(it) }
    }

    private fun closeSession() {
        try {
            captureSession?.stopRepeating()
            captureSession?.close()
            captureSession = null
        } catch(e: Exception) {}
        
        if (!isRecording) {
            try {
                mediaRecorder?.release()
                mediaRecorder = null
            } catch(e: Exception) {}
        }
    }

    private fun closeCamera() {
        closeSession()
        cameraDevice?.close()
        cameraDevice = null
        mediaRecorder?.release()
        mediaRecorder = null
    }
}
