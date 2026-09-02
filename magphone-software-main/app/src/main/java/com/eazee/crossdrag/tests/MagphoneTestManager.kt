package com.eazee.crossdrag.tests

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.eazee.crossdrag.connection.ConnectionManager
import com.eazee.crossdrag.device.Device
import com.eazee.crossdrag.handshake.HandshakeManager
import com.eazee.crossdrag.protocol.Message
import com.eazee.crossdrag.protocol.MessageType

class MagphoneTestManager(
    private val connectionManager: ConnectionManager,
    private val handshakeManager: HandshakeManager
) {

    private val results =
        mutableListOf<MagphoneTestResult>()

    private var testDevice:
            Device? = null

    private var onComplete:
            ((List<MagphoneTestResult>) -> Unit)? = null

    private var waitingForPayloadResponse =
        false

    private var testRunning =
        false

    private val handler =
        Handler(
            Looper.getMainLooper()
        )

    private var payloadTimeoutRunnable:
            Runnable? = null


    /*
     * ============================================================
     * RUN ALL TESTS
     * ============================================================
     */

    fun runAllTests(
        device: Device,
        onComplete:
            (List<MagphoneTestResult>) -> Unit
    ) {

        if (testRunning) {

            Log.d(
                "MagPhoneTest",
                "Test suite already running"
            )

            return
        }


        results.clear()

        testDevice =
            device

        this.onComplete =
            onComplete

        waitingForPayloadResponse =
            false

        testRunning =
            true


        cancelPayloadTimeout()


        Log.d(
            "MagPhoneTest",
            "================================"
        )

        Log.d(
            "MagPhoneTest",
            "Starting MagPhone test suite"
        )

        Log.d(
            "MagPhoneTest",
            "Device: ${device.name}"
        )

        Log.d(
            "MagPhoneTest",
            "================================"
        )


        /*
         * TEST 1
         *
         * Connection
         */

        testConnection(
            device
        )


        if (
            !connectionManager.isConnected(
                device.endpointId
            )
        ) {

            finishTests()

            return
        }


        /*
         * TEST 2
         *
         * Handshake
         */

        testHandshake(
            device
        )


        /*
         * TEST 3
         *
         * Payload
         */

        testPayload(
            device
        )
    }


    /*
     * ============================================================
     * CONNECTION TEST
     * ============================================================
     */

    private fun testConnection(
        device: Device
    ) {

        val connected =
            connectionManager.isConnected(
                device.endpointId
            )


        addResult(
            name =
                "Connection",

            passed =
                connected,

            message =
                if (connected) {

                    "Connected to ${device.name}"

                } else {

                    "Device is not connected"
                }
        )
    }


    /*
     * ============================================================
     * HANDSHAKE TEST
     * ============================================================
     *
     * This checks the REAL HandshakeManager state rather than
     * inventing a second handshake protocol.
     */

    private fun testHandshake(
        device: Device
    ) {

        val complete =
            handshakeManager.isComplete(
                device.endpointId
            )


        if (complete) {

            val deviceInfo =
                handshakeManager.getDeviceInfo(
                    device.endpointId
                )


            addResult(
                name =
                    "Handshake",

                passed =
                    true,

                message =
                    if (deviceInfo != null) {

                        "Handshake complete with " +
                                "${deviceInfo.name}"

                    } else {

                        "Handshake completed successfully"
                    }
            )

        } else {

            addResult(
                name =
                    "Handshake",

                passed =
                    false,

                message =
                    "Handshake has not completed with " +
                            device.name
            )
        }
    }


    /*
     * ============================================================
     * PAYLOAD TEST
     * ============================================================
     */

    private fun testPayload(
        device: Device
    ) {

        waitingForPayloadResponse =
            true


        val message =
            Message(
                type =
                    MessageType.TEST_REQUEST,

                data =
                    "MAGPHONE_TEST"
            )


        connectionManager.sendMessage(
            device.endpointId,
            message
        )


        Log.d(
            "MagPhoneTest",
            "Payload test request sent"
        )


        startPayloadTimeout()
    }


    /*
     * ============================================================
     * HANDLE MESSAGE
     * ============================================================
     */

    fun handleMessage(
        endpointId: String,
        message: Message
    ) {

        when (
            message.type
        ) {

            MessageType.TEST_REQUEST -> {

                handleTestRequest(
                    endpointId,
                    message
                )
            }


            MessageType.TEST_RESPONSE -> {

                handleTestResponse(
                    endpointId,
                    message
                )
            }
        }
    }


    /*
     * ============================================================
     * TEST REQUEST
     * ============================================================
     */

    private fun handleTestRequest(
        endpointId: String,
        message: Message
    ) {

        if (
            message.data !=
            "MAGPHONE_TEST"
        ) {

            return
        }


        Log.d(
            "MagPhoneTest",
            "Received test request from $endpointId"
        )


        val response =
            Message(
                type =
                    MessageType.TEST_RESPONSE,

                data =
                    "MAGPHONE_TEST_RESPONSE"
            )


        connectionManager.sendMessage(
            endpointId,
            response
        )


        Log.d(
            "MagPhoneTest",
            "Test response sent"
        )
    }


    /*
     * ============================================================
     * TEST RESPONSE
     * ============================================================
     */

    private fun handleTestResponse(
        endpointId: String,
        message: Message
    ) {

        val device =
            testDevice


        if (
            device == null
        ) {

            return
        }


        if (
            device.endpointId !=
            endpointId
        ) {

            return
        }


        if (
            !waitingForPayloadResponse
        ) {

            return
        }


        waitingForPayloadResponse =
            false


        cancelPayloadTimeout()


        if (
            message.data ==
            "MAGPHONE_TEST_RESPONSE"
        ) {

            addResult(
                name =
                    "Payload",

                passed =
                    true,

                message =
                    "Two-way message exchange succeeded"
            )

        } else {

            addResult(
                name =
                    "Payload",

                passed =
                    false,

                message =
                    "Received an invalid test response"
            )
        }


        finishTests()
    }


    /*
     * ============================================================
     * PAYLOAD TIMEOUT
     * ============================================================
     */

    private fun startPayloadTimeout() {

        cancelPayloadTimeout()


        payloadTimeoutRunnable =
            Runnable {

                if (
                    !waitingForPayloadResponse
                ) {

                    return@Runnable
                }


                waitingForPayloadResponse =
                    false


                addResult(
                    name =
                        "Payload",

                    passed =
                        false,

                    message =
                        "No payload response received within 5 seconds"
                )


                finishTests()
            }


        handler.postDelayed(
            payloadTimeoutRunnable!!,
            5000L
        )
    }


    /*
     * ============================================================
     * CANCEL TIMEOUT
     * ============================================================
     */

    private fun cancelPayloadTimeout() {

        payloadTimeoutRunnable?.let {
            handler.removeCallbacks(
                it
            )
        }


        payloadTimeoutRunnable =
            null
    }


    /*
     * ============================================================
     * FINISH
     * ============================================================
     */

    private fun finishTests() {

        cancelPayloadTimeout()


        waitingForPayloadResponse =
            false

        testRunning =
            false


        Log.d(
            "MagPhoneTest",
            "================================"
        )

        Log.d(
            "MagPhoneTest",
            "MagPhone test suite complete"
        )


        results.forEach {
                result ->

            Log.d(
                "MagPhoneTest",
                "${result.name}: " +
                        "${if (result.passed) "PASS" else "FAIL"} - " +
                        result.message
            )
        }


        Log.d(
            "MagPhoneTest",
            "================================"
        )


        onComplete?.invoke(
            results.toList()
        )
    }


    /*
     * ============================================================
     * RESULT MANAGEMENT
     * ============================================================
     */

    private fun addResult(
        name: String,
        passed: Boolean,
        message: String
    ) {

        results.removeAll {
            it.name == name
        }


        results.add(
            MagphoneTestResult(
                name =
                    name,

                passed =
                    passed,

                message =
                    message
            )
        )


        Log.d(
            "MagPhoneTest",
            "$name: " +
                    "${if (passed) "PASS" else "FAIL"} - " +
                    message
        )


        onComplete?.invoke(
            results.toList()
        )
    }


    /*
     * ============================================================
     * RESULTS
     * ============================================================
     */

    fun getResults():
            List<MagphoneTestResult> {

        return results.toList()
    }
}