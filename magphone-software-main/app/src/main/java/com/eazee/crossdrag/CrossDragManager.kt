package com.eazee.crossdrag

import android.content.Context
import android.net.Uri
import com.eazee.crossdrag.connection.ConnectionManager
import com.eazee.crossdrag.connection.ConnectionState
import com.eazee.crossdrag.device.Device
import com.eazee.crossdrag.device.DeviceInfo
import com.eazee.crossdrag.discovery.DiscoveryManager
import com.eazee.crossdrag.handshake.HandshakeManager
import com.eazee.crossdrag.protocol.JsonManager
import com.eazee.crossdrag.tests.MagphoneTestManager
import com.eazee.crossdrag.tests.MagphoneTestResult
import com.eazee.crossdrag.transfer.DeviceTransferInfo
import com.eazee.crossdrag.transfer.TransferDirectoryManager
import com.eazee.crossdrag.transfer.TransferManager
import com.eazee.crossdrag.transfer.TransferManifest
import com.eazee.crossdrag.transfer.TransferState
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadTransferUpdate

class CrossDragManager(
    context: Context,

    private val onStateChanged:
        (ConnectionState) -> Unit,

    private val onDeviceFound:
        (Device) -> Unit,

    private val onDeviceLost:
        (String) -> Unit,

    private val onDeviceConnected:
        (Device) -> Unit,

    private val onDeviceDisconnected:
        (String) -> Unit,

    private val onHandshakeComplete:
        (String, DeviceInfo) -> Unit,

    private val onTestResultsChanged:
        (List<MagphoneTestResult>) -> Unit,

    private val onTransferStateChanged:
        (TransferState) -> Unit = {},

    private val onTransferProgressChanged:
        (Int) -> Unit = {},

    private val onIncomingTransfer:
        (TransferManifest) -> Unit = {},

    private val onTransferComplete:
        (TransferManifest, Uri?) -> Unit = {
            _, _ ->
    },

    private val onTransferError:
        (String) -> Unit = {}
) {

    private lateinit var connectionManager:
            ConnectionManager

    private lateinit var discoveryManager:
            DiscoveryManager

    private lateinit var handshakeManager:
            HandshakeManager

    private lateinit var magphoneTestManager:
            MagphoneTestManager

    private lateinit var transferManager:
            TransferManager

    private lateinit var transferDirectoryManager:
            TransferDirectoryManager


    init {

        /*
         * ========================================================
         * CONNECTION
         * ========================================================
         */

        connectionManager =
            ConnectionManager(

                context =
                    context,

                onStateChanged = {
                        state ->

                    onStateChanged(
                        state
                    )
                },

                onDeviceConnected = {
                        device ->

                    onDeviceConnected(
                        device
                    )

                    handshakeManager
                        .startHandshake(
                            device.endpointId
                        )
                },

                onDeviceDisconnected = {
                        endpointId ->

                    handshakeManager
                        .removeConnection(
                            endpointId
                        )

                    onDeviceDisconnected(
                        endpointId
                    )
                }
            )


        /*
         * ========================================================
         * HANDSHAKE
         * ========================================================
         */

        handshakeManager =
            HandshakeManager(

                connectionManager =
                    connectionManager,

                onHandshakeComplete = {
                        endpointId,
                        deviceInfo ->

                    onHandshakeComplete(
                        endpointId,
                        deviceInfo
                    )
                }
            )


        /*
         * ========================================================
         * TESTS
         * ========================================================
         */

        magphoneTestManager =
            MagphoneTestManager(

                connectionManager =
                    connectionManager,

                handshakeManager =
                    handshakeManager
            )


        /*
         * ========================================================
         * TRANSFER DIRECTORY
         * ========================================================
         */

        transferDirectoryManager =
            TransferDirectoryManager(
                context
            )


        /*
         * ========================================================
         * FILE TRANSFER
         * ========================================================
         */

        transferManager =
            TransferManager(

                context =
                    context,

                connectionManager =
                    connectionManager,

                directoryManager =
                    transferDirectoryManager,

                onStateChanged = {
                        state ->

                    onTransferStateChanged(
                        state
                    )
                },

                onProgressChanged = {
                        progress ->

                    onTransferProgressChanged(
                        progress
                    )
                },

                onIncomingTransfer = {
                        manifest ->

                    onIncomingTransfer(
                        manifest
                    )
                },

                onTransferComplete = {
                        manifest,
                        uri ->

                    onTransferComplete(
                        manifest,
                        uri
                    )
                },

                onError = {
                        error ->

                    onTransferError(
                        error
                    )
                }
            )


        /*
         * ========================================================
         * PAYLOAD ROUTING
         * ========================================================
         */

        connectionManager
            .setPayloadHandler {
                    endpointId,
                    bytes ->

                routePayload(
                    endpointId,
                    bytes
                )
            }


        connectionManager
            .setFilePayloadHandler {
                    endpointId,
                    payload ->

                transferManager
                    .handleFilePayload(
                        endpointId,
                        payload
                    )
            }


        connectionManager
            .setPayloadTransferHandler {
                    endpointId,
                    update ->

                transferManager
                    .handleTransferUpdate(
                        endpointId,
                        update
                    )
            }


        /*
         * ========================================================
         * DISCOVERY
         * ========================================================
         */

        discoveryManager =
            DiscoveryManager(

                context =
                    context,

                onDeviceFound = {
                        device ->

                    onDeviceFound(
                        device
                    )
                },

                onDeviceLost = {
                        endpointId ->

                    onDeviceLost(
                        endpointId
                    )
                }
            )
    }


    /*
     * ============================================================
     * PAYLOAD ROUTER
     * ============================================================
     */

    private fun routePayload(
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

            } catch (_: Exception) {

                return
            }


        /*
         * Test messages.
         */

        magphoneTestManager
            .handleMessage(
                endpointId,
                message
            )


        /*
         * Handshake messages.
         */

        handshakeManager
            .handlePayload(
                endpointId,
                bytes
            )


        /*
         * Transfer control messages.
         */

        transferManager
            .handleMessage(
                endpointId,
                message
            )
    }


    /*
     * ============================================================
     * DISCOVERY
     * ============================================================
     */

    fun startDiscovery() {

        discoveryManager
            .startDiscovery()
    }


    fun stopDiscovery() {

        discoveryManager
            .stopDiscovery()
    }


    /*
     * ============================================================
     * ADVERTISING
     * ============================================================
     */

    fun startAdvertising() {

        connectionManager
            .startAdvertising()
    }


    fun stopAdvertising() {

        connectionManager
            .stopAdvertising()
    }


    /*
     * ============================================================
     * CONNECTION
     * ============================================================
     */

    fun requestConnection(
        device: Device
    ) {

        connectionManager
            .requestConnection(
                device
            )
    }


    fun disconnect(
        endpointId: String
    ) {

        connectionManager
            .disconnect(
                endpointId
            )
    }


    fun disconnectAll() {

        connectionManager
            .disconnectAll()
    }


    fun cancelConnection(
        endpointId: String
    ) {

        connectionManager
            .cancelConnection(
                endpointId
            )
    }


    /*
     * ============================================================
     * TESTS
     * ============================================================
     */

    fun runMagphoneTests(
        device: Device
    ) {

        magphoneTestManager
            .runAllTests(
                device
            ) { results ->

                onTestResultsChanged(
                    results
                )
            }
    }


    fun getTestResults():
            List<MagphoneTestResult> {

        return magphoneTestManager
            .getResults()
    }


    /*
     * ============================================================
     * FILE TRANSFER
     * ============================================================
     */

    fun sendFile(
        endpointId: String,
        uri: Uri
    ) {

        val receiverInfo =
            handshakeManager
                .getDeviceInfo(
                    endpointId
                )


        if (
            receiverInfo == null
        ) {

            onTransferError(
                "Handshake has not completed with this device"
            )

            return
        }


        val receiver =
            DeviceTransferInfo(

                name =
                    receiverInfo.name,

                model =
                    receiverInfo.model,

                androidVersion =
                    receiverInfo.androidVersion,

                appVersion =
                    receiverInfo.appVersion
            )


        transferManager
            .sendFile(
                endpointId,
                uri,
                receiver
            )
    }


    /*
     * ============================================================
     * SAVE DIRECTORY
     * ============================================================
     */

    fun setSaveDirectory(
        uri: Uri
    ): Boolean {

        return transferManager
            .setSaveDirectory(
                uri
            )
    }


    fun getSaveDirectoryName():
            String {

        return transferManager
            .getSaveDirectoryName()
    }


    /*
     * ============================================================
     * INCOMING TRANSFER
     * ============================================================
     */

    fun acceptIncomingTransfer() {

        transferManager
            .acceptIncomingTransfer()
    }


    fun rejectIncomingTransfer(
        reason: String
    ) {

        transferManager
            .rejectIncomingTransfer(
                reason
            )
    }
}