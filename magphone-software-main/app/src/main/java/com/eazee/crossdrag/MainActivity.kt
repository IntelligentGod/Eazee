package com.eazee.crossdrag

import android.Manifest
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import com.eazee.crossdrag.connection.ConnectionState
import com.eazee.crossdrag.transfer.TransferState
import com.eazee.crossdrag.ui.theme.CrossdragTheme


class MainActivity : ComponentActivity() {

    private val permissionLauncher =
        registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->

            val deniedPermissions =
                permissions.filter {
                    !it.value
                }

            if (
                deniedPermissions.isEmpty()
            ) {

                println(
                    "All permissions granted"
                )

            } else {

                println(
                    "Missing permissions: " +
                            deniedPermissions.keys
                )
            }
        }


    override fun onCreate(
        savedInstanceState: Bundle?
    ) {

        super.onCreate(
            savedInstanceState
        )


        requestPermissions()


        setContent {

            CrossdragTheme {

                CrossDragScreen(
                    viewModel =
                        ViewModelProvider(
                            this
                        )[CrossDragViewModel::class.java]
                )
            }
        }
    }


    private fun requestPermissions() {

        val permissions =
            mutableListOf<String>()


        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.S
        ) {

            permissions.add(
                Manifest.permission.BLUETOOTH_SCAN
            )

            permissions.add(
                Manifest.permission.BLUETOOTH_ADVERTISE
            )

            permissions.add(
                Manifest.permission.BLUETOOTH_CONNECT
            )
        }


        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.TIRAMISU
        ) {

            permissions.add(
                Manifest.permission.NEARBY_WIFI_DEVICES
            )
        }


        if (
            Build.VERSION.SDK_INT <=
            Build.VERSION_CODES.R
        ) {

            permissions.add(
                Manifest.permission.ACCESS_FINE_LOCATION
            )
        }


        if (
            permissions.isNotEmpty()
        ) {

            permissionLauncher.launch(
                permissions.toTypedArray()
            )
        }
    }
}


@Composable
fun CrossDragScreen(
    viewModel: CrossDragViewModel
) {

    /*
     * ============================================================
     * STATE
     * ============================================================
     */

    val connectionState =
        viewModel.connectionState.value


    val devices =
        viewModel.devices.value


    val connectedDevices =
        viewModel.connectedDevices.value


    val handshakeDevices =
        viewModel.handshakeDevices.value


    val testResults =
        viewModel.testResults.value


    val selectedFileUri =
        viewModel.selectedFileUri.value


    val incomingTransfer =
        viewModel.incomingTransfer.value


    val completedTransfer =
        viewModel.completedTransfer.value


    val completedTransferUri =
        viewModel.completedTransferUri.value


    val transferState =
        viewModel.transferState.value


    val transferProgress =
        viewModel.transferProgress.intValue


    val transferError =
        viewModel.transferError.value


    val saveDirectoryName =
        viewModel.saveDirectoryName.value


    /*
     * ============================================================
     * SAVE FOLDER PICKER
     * ============================================================
     */

    val saveDirectoryPicker =
        rememberLauncherForActivityResult(
            ActivityResultContracts.OpenDocumentTree()
        ) { uri: Uri? ->

            if (
                uri == null
            ) {

                return@rememberLauncherForActivityResult
            }


            val saved =
                viewModel.setSaveDirectory(
                    uri
                )


            if (
                !saved
            ) {

                viewModel.transferError.value =
                    "Could not save the selected folder"
            }
        }


    /*
     * ============================================================
     * FILE PICKER
     * ============================================================
     */

    val sendFilePicker =
        rememberLauncherForActivityResult(
            ActivityResultContracts.OpenDocument()
        ) { uri: Uri? ->

            viewModel.setSelectedFile(
                uri
            )
        }


    /*
     * ============================================================
     * UI
     * ============================================================
     */

    Column(

        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(
                    rememberScrollState()
                )
                .padding(24.dp),

        horizontalAlignment =
            Alignment.CenterHorizontally,

        verticalArrangement =
            Arrangement.Top
    ) {

        /*
         * ========================================================
         * TITLE
         * ========================================================
         */

        Text(
            text =
                "MagPhone",

            style =
                MaterialTheme
                    .typography
                    .headlineLarge
        )


        Spacer(
            modifier =
                Modifier.height(30.dp)
        )


        /*
         * ========================================================
         * ADVERTISING
         * ========================================================
         */

        Button(
            onClick = {

                viewModel
                    .startAdvertising()
            }
        ) {

            Text(
                "Start Advertising"
            )
        }


        Spacer(
            modifier =
                Modifier.height(10.dp)
        )


        Button(
            onClick = {

                viewModel
                    .stopAdvertising()
            }
        ) {

            Text(
                "Stop Advertising"
            )
        }


        Spacer(
            modifier =
                Modifier.height(15.dp)
        )


        /*
         * ========================================================
         * DISCOVERY
         * ========================================================
         */

        Button(
            onClick = {

                viewModel
                    .startDiscovery()
            }
        ) {

            Text(
                "Find Devices"
            )
        }


        Spacer(
            modifier =
                Modifier.height(10.dp)
        )


        Button(
            onClick = {

                viewModel
                    .stopDiscovery()
            }
        ) {

            Text(
                "Stop Discovery"
            )
        }


        Spacer(
            modifier =
                Modifier.height(25.dp)
        )


        /*
         * ========================================================
         * NEARBY DEVICES
         * ========================================================
         */

        Text(
            text =
                "Nearby devices:",

            style =
                MaterialTheme
                    .typography
                    .titleMedium
        )


        devices.forEach { device ->

            Spacer(
                modifier =
                    Modifier.height(10.dp)
            )


            Text(
                text =
                    "📱 ${device.name}"
            )


            Button(
                onClick = {

                    viewModel
                        .requestConnection(
                            device
                        )
                }
            ) {

                Text(
                    "Connect"
                )
            }
        }


        Spacer(
            modifier =
                Modifier.height(20.dp)
        )


        /*
         * ========================================================
         * CONNECTED DEVICES
         * ========================================================
         */

        Text(
            text =
                "Connected devices:",

            style =
                MaterialTheme
                    .typography
                    .titleMedium
        )


        connectedDevices.forEach { device ->

            Spacer(
                modifier =
                    Modifier.height(10.dp)
            )


            Text(
                text =
                    "✅ ${device.name}"
            )


            Spacer(
                modifier =
                    Modifier.height(5.dp)
            )


            Button(
                onClick = {

                    viewModel
                        .disconnect(
                            device.endpointId
                        )
                }
            ) {

                Text(
                    "Disconnect"
                )
            }
        }


        Spacer(
            modifier =
                Modifier.height(20.dp)
        )


        /*
         * ========================================================
         * HANDSHAKES
         * ========================================================
         */

        Text(
            text =
                "Handshakes:",

            style =
                MaterialTheme
                    .typography
                    .titleMedium
        )


        handshakeDevices.forEach { deviceInfo ->

            Spacer(
                modifier =
                    Modifier.height(5.dp)
            )


            Text(
                text =
                    "🤝 ${deviceInfo.name} " +
                            "(${deviceInfo.model})"
            )
        }


        Spacer(
            modifier =
                Modifier.height(25.dp)
        )


        /*
         * ========================================================
         * TESTS
         * ========================================================
         */

        Button(
            enabled =
                connectedDevices.isNotEmpty(),

            onClick = {

                viewModel
                    .runTests()
            }
        ) {

            Text(
                "Run MagPhone Tests"
            )
        }


        Spacer(
            modifier =
                Modifier.height(20.dp)
        )


        /*
         * ========================================================
         * FILE TRANSFER
         * ========================================================
         */

        Text(
            text =
                "File Transfer",

            style =
                MaterialTheme
                    .typography
                    .titleMedium
        )


        Spacer(
            modifier =
                Modifier.height(10.dp)
        )


        /*
         * SAVE FOLDER
         */

        Text(
            text =
                "Save incoming files to:"
        )


        Spacer(
            modifier =
                Modifier.height(5.dp)
        )


        Text(
            text =
                "📁 $saveDirectoryName"
        )


        Spacer(
            modifier =
                Modifier.height(10.dp)
        )


        Button(
            onClick = {

                saveDirectoryPicker
                    .launch(
                        null
                    )
            }
        ) {

            Text(
                "Choose Save Folder"
            )
        }


        Spacer(
            modifier =
                Modifier.height(15.dp)
        )


        /*
         * SELECT FILE
         */

        Button(

            enabled =
                connectedDevices.isNotEmpty() &&
                        transferState !=
                        TransferState.REQUESTING &&
                        transferState !=
                        TransferState.TRANSFERRING &&
                        transferState !=
                        TransferState.RECEIVING,

            onClick = {

                sendFilePicker
                    .launch(
                        arrayOf(
                            "*/*"
                        )
                    )
            }
        ) {

            Text(
                "Select File"
            )
        }


        selectedFileUri?.let {

            Spacer(
                modifier =
                    Modifier.height(10.dp)
            )


            Text(
                text =
                    "File selected"
            )
        }


        Spacer(
            modifier =
                Modifier.height(10.dp)
        )


        /*
         * SEND FILE
         */

        Button(

            enabled =
                selectedFileUri != null &&
                        connectedDevices.isNotEmpty() &&
                        transferState !=
                        TransferState.REQUESTING &&
                        transferState !=
                        TransferState.TRANSFERRING &&
                        transferState !=
                        TransferState.RECEIVING,

            onClick = {

                viewModel
                    .sendSelectedFile()
            }
        ) {

            Text(
                "Send File"
            )
        }


        Spacer(
            modifier =
                Modifier.height(15.dp)
        )


        /*
         * TRANSFER STATUS
         */

        Text(
            text =
                "Transfer: $transferState"
        )


        if (
            transferState ==
            TransferState.REQUESTING ||
            transferState ==
            TransferState.TRANSFERRING ||
            transferState ==
            TransferState.RECEIVING
        ) {

            Spacer(
                modifier =
                    Modifier.height(5.dp)
            )


            Text(
                text =
                    "Progress: $transferProgress%"
            )
        }


        /*
         * INCOMING FILE
         */

        incomingTransfer?.let { manifest ->

            Spacer(
                modifier =
                    Modifier.height(15.dp)
            )


            Text(
                text =
                    "📥 Incoming file"
            )


            Text(
                text =
                    "${manifest.file.iconType} " +
                            manifest.file.name
            )


            Text(
                text =
                    "From: ${manifest.sender.name}"
            )


            Text(
                text =
                    "Size: ${manifest.file.size} bytes"
            )


            Text(
                text =
                    "Type: ${manifest.file.mimeType}"
            )


            Text(
                text =
                    "Saving to: $saveDirectoryName"
            )
        }


        /*
         * COMPLETED TRANSFER
         */

        completedTransfer?.let { manifest ->

            Spacer(
                modifier =
                    Modifier.height(15.dp)
            )


            Text(
                text =
                    "✅ Transfer complete"
            )


            Text(
                text =
                    manifest.file.name
            )


            Text(
                text =
                    "From: ${manifest.sender.name}"
            )


            Text(
                text =
                    "To: ${manifest.receiver.name}"
            )


            if (
                completedTransferUri != null
            ) {

                Text(
                    text =
                        "Saved successfully"
                )
            }
        }


        /*
         * ERROR
         */

        transferError?.let { error ->

            Spacer(
                modifier =
                    Modifier.height(10.dp)
            )


            Text(
                text =
                    "❌ $error"
            )
        }


        Spacer(
            modifier =
                Modifier.height(20.dp)
        )


        /*
         * TEST RESULTS
         */

        if (
            testResults.isNotEmpty()
        ) {

            Text(
                text =
                    "Test Results:",

                style =
                    MaterialTheme
                        .typography
                        .titleMedium
            )


            Spacer(
                modifier =
                    Modifier.height(10.dp)
            )


            testResults.forEach { result ->

                Text(
                    text =
                        if (
                            result.passed
                        ) {

                            "✅ ${result.name}: " +
                                    result.message

                        } else {

                            "❌ ${result.name}: " +
                                    result.message
                        }
                )


                Spacer(
                    modifier =
                        Modifier.height(5.dp)
                )
            }
        }


        Spacer(
            modifier =
                Modifier.height(20.dp)
        )


        /*
         * STATUS
         */

        Text(
            text =
                "Status: $connectionState"
        )


        Spacer(
            modifier =
                Modifier.height(24.dp)
        )
    }
}