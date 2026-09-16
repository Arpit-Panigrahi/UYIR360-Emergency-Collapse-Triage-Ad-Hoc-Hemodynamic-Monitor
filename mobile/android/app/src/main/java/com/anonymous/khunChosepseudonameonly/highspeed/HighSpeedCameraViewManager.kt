package com.anonymous.khunChosepseudonameonly.highspeed

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.ThemedReactContext

class HighSpeedCameraViewManager : SimpleViewManager<HighSpeedCameraView>() {
    override fun getName(): String = "HighSpeedCameraView"

    override fun createViewInstance(reactContext: ThemedReactContext): HighSpeedCameraView {
        return HighSpeedCameraView(reactContext)
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
        return mutableMapOf(
            "topFrameData" to mutableMapOf("registrationName" to "onFrameData"),
            "topMeasurementComplete" to mutableMapOf("registrationName" to "onMeasurementComplete")
        )
    }

    override fun getCommandsMap(): Map<String, Int> {
        return mapOf("startRecording" to 1, "stopRecording" to 2)
    }

    override fun receiveCommand(root: HighSpeedCameraView, commandId: String, args: ReadableArray?) {
        when (commandId) {
            "1", "startRecording" -> {
                val path = args?.getString(0) ?: return
                root.startRecording(path)
            }
            "2", "stopRecording" -> root.stopRecording()
        }
    }
}
