package com.eazee.crossdrag

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.AndroidViewModel
import com.eazee.crossdrag.connection.ConnectionState
import com.eazee.crossdrag.device.Device
import com.eazee.crossdrag.device.DeviceInfo
import com.eazee.crossdrag.tests.MagphoneTestResult
import com.eazee.crossdrag.transfer.TransferManifest
import com.eazee.crossdrag.transfer.TransferState

class CrossDragViewModel(
    application: Application
) : AndroidViewModel(application) {

    val connectionState:
            MutableState<ConnectionState> =
        mutableStateOf(
            ConnectionState.DISCONNECTED
        )


    val devices:
            MutableState<List<Device>> =
        mutableStateOf(
            emptyList()
        )


    val connectedDevices:
            MutableState<List<Device>> =
        mutableStateOf(
            emptyList()
        )


    val handshakeDevices:
            MutableState<List<DeviceInfo>> =
        mutableStateOf(
            emptyList()
        )


    val testResults:
            MutableState<List<MagphoneTestResult>> =
        mutableStateOf(
            emptyList()
        )


    val selectedFileUri:
            MutableState<Uri?> =
        mutableStateOf(
            null
        )


    val incomingTransfer:
            MutableState<TransferManifest?> =
        mutableStateOf(
            null
        )


    val completedTransfer:
            MutableState<TransferManifest?> =
        mutableStateOf(
            null
        )


    val completedTransferUri:
            MutableState<Uri?> =
        mutableStateOf(
            null
        )


    val transferState:
            MutableState<TransferState> =
        mutableStateOf(
            TransferState.IDLE
        )


    val transferProgress =
        mutableIntStateOf(
            0
        )


    val transferError:
            MutableState<String?> =
        mutableStateOf(
            null
        )


    val saveDirectoryName:
            MutableState<String> =
        mutableStateOf(
            "Not selected"
        )


    /*
     * ============================================================
     * MANAGER
     * ============================================================
     */

    lateinit var crossDragManager:
            CrossDragManager


    /*
     * ============================================================
     * INITIALIZATION
     * ============================================================
     */

    init {

        crossDragManager =
            CrossDragManager(

                context =
                    application.applicationContext,

                onStateChanged = {
                        state ->

                    connectionState.value =
                        state
                },

                onDeviceFound = {
                        device ->

                    if (
                        devices.value.none {
                            it.endpointId ==
                                    device.endpointId
                        }
                    ) {

                        devices.value =
                            devices.value +
                                    device
                    }
                },

                onDeviceLost = {
                        endpointId ->

                    devices.value =
                        devices.value.filter {
                            it.endpointId !=
                                    endpointId
                        }
                },

                onDeviceConnected = {
                        device ->

                    if (
                        connectedDevices.value.none {
                            it.endpointId ==
                                    device.endpointId
                        }
                    ) {

                        connectedDevices.value =
                            connectedDevices.value +
                                    device
                    }
                },

                onDeviceDisconnected = {
                        endpointId ->

                    connectedDevices.value =
                        connectedDevices.value.filter {
                            it.endpointId !=
                                    endpointId
                        }
                },

                onHandshakeComplete = {
                        _,
                        deviceInfo ->

                    if (
                        handshakeDevices.value.none {
                            it.name ==
                                    deviceInfo.name &&
                                    it.model ==
                                    deviceInfo.model
                        }
                    ) {

                        handshakeDevices.value =
                            handshakeDevices.value +
                                    deviceInfo
                    }
                },

                onTestResultsChanged = {
                        results ->

                    testResults.value =
                        results
                },

                onTransferStateChanged = {
                        state ->

                    transferState.value =
                        state
                },

                onTransferProgressChanged = {
                        progress ->

                    transferProgress.intValue =
                        progress
                },

                onIncomingTransfer = {
                        manifest ->

                    incomingTransfer.value =
                        manifest

                    completedTransfer.value =
                        null

                    completedTransferUri.value =
                        null

                    transferError.value =
                        null

                    transferProgress.intValue =
                        0

                    saveDirectoryName.value =
                        crossDragManager
                            .getSaveDirectoryName()
                },

                onTransferComplete = {
                        manifest,
                        uri ->

                    completedTransfer.value =
                        manifest

                    completedTransferUri.value =
                        uri

                    incomingTransfer.value =
                        null
                },

                onTransferError = {
                        error ->

                    transferError.value =
                        error
                }
            )


        saveDirectoryName.value =
            crossDragManager
                .getSaveDirectoryName()
    }


    /*
     * ============================================================
     * DISCOVERY
     * ============================================================
     */

    fun startDiscovery() {

        crossDragManager
            .startDiscovery()
    }


    fun stopDiscovery() {

        crossDragManager
            .stopDiscovery()

        devices.value =
            emptyList()
    }


    /*
     * ============================================================
     * ADVERTISING
     * ============================================================
     */

    fun startAdvertising() {

        crossDragManager
            .startAdvertising()
    }


    fun stopAdvertising() {

        crossDragManager
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

        crossDragManager
            .requestConnection(
                device
            )
    }


    fun disconnect(
        endpointId: String
    ) {

        crossDragManager
            .disconnect(
                endpointId
            )
    }


    /*
     * ============================================================
     * TESTS
     * ============================================================
     */

    fun runTests() {

        connectedDevices.value
            .firstOrNull()
            ?.let { device ->

                testResults.value =
                    emptyList()

                crossDragManager
                    .runMagphoneTests(
                        device
                    )
            }
    }


    /*
     * ============================================================
     * FILE SELECTION
     * ============================================================
     */

    fun setSelectedFile(
        uri: Uri?
    ) {

        selectedFileUri.value =
            uri

        transferError.value =
            null

        completedTransfer.value =
            null

        completedTransferUri.value =
            null

        transferProgress.intValue =
            0


        if (
            uri == null
        ) {

            transferState.value =
                TransferState.IDLE
        }
    }


    /*
     * ============================================================
     * SEND FILE
     * ============================================================
     */

    fun sendSelectedFile() {

        val uri =
            selectedFileUri.value


        val device =
            connectedDevices.value
                .firstOrNull()


        if (
            uri == null ||
            device == null
        ) {

            return
        }


        transferError.value =
            null

        completedTransfer.value =
            null

        completedTransferUri.value =
            null

        transferProgress.intValue =
            0


        crossDragManager
            .sendFile(
                device.endpointId,
                uri
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

        val saved =
            crossDragManager
                .setSaveDirectory(
                    uri
                )


        if (
            saved
        ) {

            saveDirectoryName.value =
                crossDragManager
                    .getSaveDirectoryName()
        }


        return saved
    }


    /*
     * ============================================================
     * INCOMING TRANSFER
     * ============================================================
     */

    fun rejectIncomingTransfer(
        reason: String
    ) {

        crossDragManager
            .rejectIncomingTransfer(
                reason
            )
    }
}