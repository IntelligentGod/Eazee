package com.eazee.crossdrag.connection

import android.content.Context
import android.net.Uri
import android.util.Log
import com.eazee.crossdrag.device.Device
import com.eazee.crossdrag.protocol.JsonManager
import com.eazee.crossdrag.protocol.Message
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy

class ConnectionManager(
    context: Context,
    private val onStateChanged: (ConnectionState) -> Unit,
    private val onDeviceConnected: (Device) -> Unit,
    private val onDeviceDisconnected: (String) -> Unit
) {

    private val appContext =
        context.applicationContext

    private val serviceId =
        "com.eazee.crossdrag"

    private val deviceName =
        android.os.Build.MODEL

    private val connectedDevices =
        mutableMapOf<String, Device>()

    private val pendingDevices =
        mutableMapOf<String, Device>()

    private val outgoingFilePayloads =
        mutableMapOf<Long, Payload>()

    private val incomingFilePayloads =
        mutableMapOf<Long, Payload>()

    private val connectionsClient =
        Nearby.getConnectionsClient(
            appContext
        )

    private var payloadHandler:
            ((String, ByteArray) -> Unit)? =
        null

    private var filePayloadHandler:
            ((String, Payload) -> Unit)? =
        null

    private var payloadTransferHandler:
            ((String, PayloadTransferUpdate) -> Unit)? =
        null

    private var isAdvertising =
        false


    /*
     * ============================================================
     * PAYLOAD HANDLERS
     * ============================================================
     */

    fun setPayloadHandler(
        handler: (String, ByteArray) -> Unit
    ) {

        payloadHandler =
            handler
    }


    fun setFilePayloadHandler(
        handler: (String, Payload) -> Unit
    ) {

        filePayloadHandler =
            handler
    }


    fun setPayloadTransferHandler(
        handler: (
            String,
            PayloadTransferUpdate
        ) -> Unit
    ) {

        payloadTransferHandler =
            handler
    }


    /*
     * ============================================================
     * PAYLOAD CALLBACK
     * ============================================================
     */

    private val payloadCallback =
        object : PayloadCallback() {

            override fun onPayloadReceived(
                endpointId: String,
                payload: Payload
            ) {

                when (
                    payload.type
                ) {

                    Payload.Type.BYTES -> {

                        val bytes =
                            payload.asBytes()


                        if (
                            bytes != null
                        ) {

                            Log.d(
                                "CrossDrag",
                                "Byte payload received from $endpointId"
                            )


                            payloadHandler?.invoke(
                                endpointId,
                                bytes
                            )
                        }
                    }


                    Payload.Type.FILE -> {

                        incomingFilePayloads[
                            payload.id
                        ] =
                            payload


                        Log.d(
                            "CrossDrag",
                            "File payload received from " +
                                    "$endpointId id=${payload.id}"
                        )


                        filePayloadHandler?.invoke(
                            endpointId,
                            payload
                        )
                    }


                    else -> {

                        Log.d(
                            "CrossDrag",
                            "Unsupported payload type: " +
                                    payload.type
                        )
                    }
                }
            }


            override fun onPayloadTransferUpdate(
                endpointId: String,
                update: PayloadTransferUpdate
            ) {

                /*
                 * Let the subsystem process the event first.
                 *
                 * This is important because TransferManager
                 * needs access to the completed incoming file
                 * before the Payload is closed.
                 */

                payloadTransferHandler?.invoke(
                    endpointId,
                    update
                )


                if (
                    update.status ==
                    PayloadTransferUpdate.Status.SUCCESS ||
                    update.status ==
                    PayloadTransferUpdate.Status.FAILURE ||
                    update.status ==
                    PayloadTransferUpdate.Status.CANCELED
                ) {

                    outgoingFilePayloads
                        .remove(
                            update.payloadId
                        )
                        ?.close()


                    incomingFilePayloads
                        .remove(
                            update.payloadId
                        )
                        ?.close()
                }
            }
        }


    /*
     * ============================================================
     * CONNECTION CALLBACK
     * ============================================================
     */

    private val connectionLifecycleCallback =
        object : ConnectionLifecycleCallback() {

            override fun onConnectionInitiated(
                endpointId: String,
                connectionInfo: ConnectionInfo
            ) {

                Log.d(
                    "CrossDrag",
                    "Connection initiated with " +
                            "${connectionInfo.endpointName} " +
                            "($endpointId)"
                )


                if (
                    connectedDevices.containsKey(
                        endpointId
                    )
                ) {

                    connectionsClient
                        .rejectConnection(
                            endpointId
                        )

                    return
                }


                val device =
                    pendingDevices[
                        endpointId
                    ] ?: Device(
                        name =
                            connectionInfo.endpointName,

                        endpointId =
                            endpointId
                    )


                pendingDevices[
                    endpointId
                ] =
                    device


                onStateChanged(
                    ConnectionState.CONNECTING
                )


                connectionsClient
                    .acceptConnection(
                        endpointId,
                        payloadCallback
                    )
                    .addOnFailureListener { error ->

                        pendingDevices.remove(
                            endpointId
                        )


                        Log.e(
                            "CrossDrag",
                            "Failed to accept connection",
                            error
                        )


                        if (
                            connectedDevices.isEmpty()
                        ) {

                            onStateChanged(
                                ConnectionState.FAILED
                            )
                        }
                    }
            }


            override fun onConnectionResult(
                endpointId: String,
                result: ConnectionResolution
            ) {

                val status =
                    result.status.statusCode


                if (
                    status ==
                    ConnectionsStatusCodes.STATUS_OK
                ) {

                    if (
                        connectedDevices.containsKey(
                            endpointId
                        )
                    ) {

                        pendingDevices.remove(
                            endpointId
                        )

                        return
                    }


                    val device =
                        pendingDevices.remove(
                            endpointId
                        ) ?: Device(
                            name =
                                "Unknown Device",

                            endpointId =
                                endpointId
                        )


                    connectedDevices[
                        endpointId
                    ] =
                        device


                    Log.d(
                        "CrossDrag",
                        "Connected to ${device.name}"
                    )


                    onDeviceConnected(
                        device
                    )


                    onStateChanged(
                        ConnectionState.CONNECTED
                    )

                } else {

                    pendingDevices.remove(
                        endpointId
                    )


                    Log.e(
                        "CrossDrag",
                        "Connection failed: " +
                                "$endpointId status=$status"
                    )


                    if (
                        connectedDevices.isEmpty()
                    ) {

                        onStateChanged(
                            ConnectionState.FAILED
                        )
                    }
                }
            }


            override fun onDisconnected(
                endpointId: String
            ) {

                val device =
                    connectedDevices.remove(
                        endpointId
                    )


                pendingDevices.remove(
                    endpointId
                )


                if (
                    device == null
                ) {

                    return
                }


                Log.d(
                    "CrossDrag",
                    "Disconnected from ${device.name}"
                )


                onDeviceDisconnected(
                    endpointId
                )


                if (
                    connectedDevices.isEmpty()
                ) {

                    onStateChanged(
                        ConnectionState.DISCONNECTED
                    )
                }
            }
        }


    /*
     * ============================================================
     * ADVERTISING
     * ============================================================
     */

    fun startAdvertising() {

        if (
            isAdvertising
        ) {

            return
        }


        val options =
            AdvertisingOptions.Builder()
                .setStrategy(
                    Strategy.P2P_CLUSTER
                )
                .build()


        connectionsClient
            .startAdvertising(
                deviceName,
                serviceId,
                connectionLifecycleCallback,
                options
            )
            .addOnSuccessListener {

                isAdvertising =
                    true


                Log.d(
                    "CrossDrag",
                    "Advertising started"
                )


                onStateChanged(
                    ConnectionState.ADVERTISING
                )
            }
            .addOnFailureListener { error ->

                isAdvertising =
                    false


                Log.e(
                    "CrossDrag",
                    "Failed to start advertising",
                    error
                )


                onStateChanged(
                    ConnectionState.FAILED
                )
            }
    }


    /*
     * ============================================================
     * STOP ADVERTISING
     * ============================================================
     */

    fun stopAdvertising() {

        if (
            !isAdvertising
        ) {

            return
        }


        connectionsClient.stopAdvertising()


        isAdvertising =
            false


        Log.d(
            "CrossDrag",
            "Advertising stopped"
        )
    }


    /*
     * ============================================================
     * REQUEST CONNECTION
     * ============================================================
     */

    fun requestConnection(
        device: Device
    ) {

        if (
            connectedDevices.containsKey(
                device.endpointId
            )
        ) {

            return
        }


        if (
            pendingDevices.containsKey(
                device.endpointId
            )
        ) {

            return
        }


        pendingDevices[
            device.endpointId
        ] =
            device


        onStateChanged(
            ConnectionState.CONNECTING
        )


        connectionsClient
            .requestConnection(
                deviceName,
                device.endpointId,
                connectionLifecycleCallback
            )
            .addOnFailureListener { error ->

                pendingDevices.remove(
                    device.endpointId
                )


                Log.e(
                    "CrossDrag",
                    "Failed to request connection",
                    error
                )


                if (
                    connectedDevices.isEmpty()
                ) {

                    onStateChanged(
                        ConnectionState.FAILED
                    )
                }
            }
    }


    /*
     * ============================================================
     * DISCONNECT
     * ============================================================
     */

    fun disconnect(
        endpointId: String
    ) {

        connectionsClient
            .disconnectFromEndpoint(
                endpointId
            )
    }


    /*
     * ============================================================
     * DISCONNECT ALL
     * ============================================================
     */

    fun disconnectAll() {

        connectedDevices.keys
            .toList()
            .forEach { endpointId ->

                connectionsClient
                    .disconnectFromEndpoint(
                        endpointId
                    )
            }


        pendingDevices.keys
            .toList()
            .forEach { endpointId ->

                connectionsClient
                    .disconnectFromEndpoint(
                        endpointId
                    )
            }
    }


    /*
     * ============================================================
     * CANCEL CONNECTION
     * ============================================================
     */

    fun cancelConnection(
        endpointId: String
    ) {

        pendingDevices.remove(
            endpointId
        )


        connectionsClient
            .disconnectFromEndpoint(
                endpointId
            )
    }


    /*
     * ============================================================
     * SEND BYTES
     * ============================================================
     */

    fun sendPayload(
        endpointId: String,
        bytes: ByteArray
    ) {

        if (
            !isConnected(
                endpointId
            )
        ) {

            Log.e(
                "CrossDrag",
                "Cannot send payload; " +
                        "device is not connected"
            )

            return
        }


        connectionsClient
            .sendPayload(
                endpointId,
                Payload.fromBytes(
                    bytes
                )
            )
            .addOnFailureListener { error ->

                Log.e(
                    "CrossDrag",
                    "Failed to send byte payload",
                    error
                )
            }
    }


    /*
     * ============================================================
     * SEND MESSAGE
     * ============================================================
     */

    fun sendMessage(
        endpointId: String,
        message: Message
    ) {

        val json =
            JsonManager.encode(
                message
            )


        sendPayload(
            endpointId,
            json.toByteArray(
                Charsets.UTF_8
            )
        )
    }


    /*
     * ============================================================
     * SEND FILE
     * ============================================================
     */

    fun sendFile(
        endpointId: String,
        uri: Uri,
        fileName: String
    ): Long? {

        if (
            !isConnected(
                endpointId
            )
        ) {

            Log.e(
                "CrossDrag",
                "Cannot send file; " +
                        "device is not connected"
            )

            return null
        }


        return try {

            val descriptor =
                appContext
                    .contentResolver
                    .openFileDescriptor(
                        uri,
                        "r"
                    )


            if (
                descriptor == null
            ) {

                Log.e(
                    "CrossDrag",
                    "Could not open file descriptor"
                )

                return null
            }


            val payload =
                Payload.fromFile(
                    descriptor
                )


            payload.setFileName(
                fileName
            )


            val payloadId =
                payload.id


            outgoingFilePayloads[
                payloadId
            ] =
                payload


            connectionsClient
                .sendPayload(
                    endpointId,
                    payload
                )
                .addOnFailureListener { error ->

                    outgoingFilePayloads
                        .remove(
                            payloadId
                        )
                        ?.close()


                    Log.e(
                        "CrossDrag",
                        "Failed to send file payload",
                        error
                    )
                }


            Log.d(
                "CrossDrag",
                "File payload queued: $payloadId"
            )


            payloadId

        } catch (error: Exception) {

            Log.e(
                "CrossDrag",
                "Could not create file payload",
                error
            )

            null
        }
    }


    /*
     * ============================================================
     * CANCEL PAYLOAD
     * ============================================================
     */

    fun cancelPayload(
        payloadId: Long
    ) {

        connectionsClient
            .cancelPayload(
                payloadId
            )
    }


    /*
     * ============================================================
     * STATUS
     * ============================================================
     */

    fun isConnected(
        endpointId: String
    ): Boolean {

        return connectedDevices.containsKey(
            endpointId
        )
    }


    fun getConnectedDevices():
            List<Device> {

        return connectedDevices.values.toList()
    }


    fun isAdvertising():
            Boolean {

        return isAdvertising
    }
}