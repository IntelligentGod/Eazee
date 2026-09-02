package com.eazee.crossdrag.handshake

import android.os.Build
import android.util.Log
import com.eazee.crossdrag.connection.ConnectionManager
import com.eazee.crossdrag.device.DeviceInfo
import com.eazee.crossdrag.protocol.JsonManager
import com.eazee.crossdrag.protocol.Message
import com.eazee.crossdrag.protocol.MessageType

class HandshakeManager(
    private val connectionManager: ConnectionManager,
    private val onHandshakeComplete: (String, DeviceInfo) -> Unit
) {

    /*
     * ============================================================
     * LOCAL DEVICE INFORMATION
     * ============================================================
     */

    private val localDeviceInfo =
        DeviceInfo(
            name = Build.MODEL,
            model = Build.MODEL,
            androidVersion = Build.VERSION.SDK_INT,
            appVersion = "1.0"
        )


    /*
     * ============================================================
     * REMOTE DEVICE INFORMATION
     * ============================================================
     */

    private val completedHandshakes =
        mutableMapOf<String, DeviceInfo>()


    /*
     * ============================================================
     * DEVICES WE HAVE SENT DEVICE INFO TO
     * ============================================================
     */

    private val deviceInfoSent =
        mutableSetOf<String>()


    /*
     * ============================================================
     * START HANDSHAKE
     * ============================================================
     */

    fun startHandshake(
        endpointId: String
    ) {

        if (
            completedHandshakes.containsKey(
                endpointId
            )
        ) {

            Log.d(
                "CrossDrag",
                "Handshake already complete with $endpointId"
            )

            return
        }


        sendDeviceInfo(
            endpointId
        )


        Log.d(
            "CrossDrag",
            "Handshake started with $endpointId"
        )
    }


    /*
     * ============================================================
     * SEND DEVICE INFO
     * ============================================================
     */

    private fun sendDeviceInfo(
        endpointId: String
    ) {

        if (
            deviceInfoSent.contains(
                endpointId
            )
        ) {

            Log.d(
                "CrossDrag",
                "Device info already sent to $endpointId"
            )

            return
        }


        deviceInfoSent.add(
            endpointId
        )


        val message =
            Message(
                type =
                    MessageType.DEVICE_INFO,

                data =
                    JsonManager.encodeDeviceInfo(
                        localDeviceInfo
                    )
            )


        connectionManager.sendMessage(
            endpointId,
            message
        )


        Log.d(
            "CrossDrag",
            "Sent device information to $endpointId"
        )
    }


    /*
     * ============================================================
     * HANDLE PAYLOAD
     * ============================================================
     */

    fun handlePayload(
        endpointId: String,
        bytes: ByteArray
    ) {

        val message =
            try {

                JsonManager.decode(
                    bytes.toString(
                        Charsets.UTF_8
                    )
                )

            } catch (e: Exception) {

                Log.e(
                    "CrossDrag",
                    "Could not decode handshake payload",
                    e
                )

                return
            }


        /*
         * Only DEVICE_INFO belongs to the handshake.
         */

        if (
            message.type !=
            MessageType.DEVICE_INFO
        ) {

            return
        }


        val deviceInfo =
            try {

                JsonManager.decodeDeviceInfo(
                    message.data
                )

            } catch (e: Exception) {

                Log.e(
                    "CrossDrag",
                    "Invalid device information received",
                    e
                )

                return
            }


        /*
         * Store the remote device.
         */

        completedHandshakes[
            endpointId
        ] = deviceInfo


        Log.d(
            "CrossDrag",
            "Received device information from " +
                    "${deviceInfo.name}"
        )


        /*
         * Make sure we have also sent our information.
         *
         * This handles the case where this device receives
         * DEVICE_INFO before its own startHandshake() runs.
         */

        sendDeviceInfo(
            endpointId
        )


        /*
         * Tell the rest of CrossDrag that the handshake
         * has completed.
         */

        onHandshakeComplete(
            endpointId,
            deviceInfo
        )


        Log.d(
            "CrossDrag",
            "Handshake complete with " +
                    "${deviceInfo.name}"
        )
    }


    /*
     * ============================================================
     * HANDSHAKE STATUS
     * ============================================================
     */

    fun isComplete(
        endpointId: String
    ): Boolean {

        return completedHandshakes.containsKey(
            endpointId
        )
    }


    /*
     * ============================================================
     * GET DEVICE INFO
     * ============================================================
 */

    fun getDeviceInfo(
        endpointId: String
    ): DeviceInfo? {

        return completedHandshakes[
            endpointId
        ]
    }


    /*
     * ============================================================
     * REMOVE CONNECTION
     * ============================================================
     */

    fun removeConnection(
        endpointId: String
    ) {

        completedHandshakes.remove(
            endpointId
        )

        deviceInfoSent.remove(
            endpointId
        )


        Log.d(
            "CrossDrag",
            "Removed handshake state for $endpointId"
        )
    }
}