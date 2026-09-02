package com.eazee.crossdrag.discovery

import android.content.Context
import android.util.Log
import com.eazee.crossdrag.device.Device
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Strategy

class DiscoveryManager(
    context: Context,
    private val onDeviceFound: (Device) -> Unit,
    private val onDeviceLost: (String) -> Unit
) {

    private val serviceId =
        "com.eazee.crossdrag"

    private val connectionsClient =
        Nearby.getConnectionsClient(
            context
        )

    private val discoveredDevices =
        mutableMapOf<String, Device>()

    private var isDiscovering =
        false


    /*
     * ============================================================
     * DISCOVERY CALLBACK
     * ============================================================
     */

    private val endpointDiscoveryCallback =
        object : EndpointDiscoveryCallback() {

            override fun onEndpointFound(
                endpointId: String,
                info: DiscoveredEndpointInfo
            ) {

                /*
                 * Ignore duplicate discovery events.
                 */

                if (
                    discoveredDevices.containsKey(
                        endpointId
                    )
                ) {

                    Log.d(
                        "CrossDrag",
                        "Ignoring duplicate device: $endpointId"
                    )

                    return
                }


                val device =
                    Device(
                        name =
                            info.endpointName,

                        endpointId =
                            endpointId
                    )


                discoveredDevices[
                    endpointId
                ] = device


                Log.d(
                    "CrossDrag",
                    "Device found: ${info.endpointName} ($endpointId)"
                )


                onDeviceFound(
                    device
                )
            }


            override fun onEndpointLost(
                endpointId: String
            ) {

                discoveredDevices.remove(
                    endpointId
                )


                Log.d(
                    "CrossDrag",
                    "Device lost: $endpointId"
                )


                onDeviceLost(
                    endpointId
                )
            }
        }


    /*
     * ============================================================
     * START DISCOVERY
     * ============================================================
     */

    fun startDiscovery() {

        if (
            isDiscovering
        ) {

            Log.d(
                "CrossDrag",
                "Discovery already running"
            )

            return
        }


        discoveredDevices.clear()


        val options =
            DiscoveryOptions.Builder()
                .setStrategy(
                    Strategy.P2P_CLUSTER
                )
                .build()


        connectionsClient
            .startDiscovery(
                serviceId,
                endpointDiscoveryCallback,
                options
            )
            .addOnSuccessListener {

                isDiscovering =
                    true

                Log.d(
                    "CrossDrag",
                    "Discovery started"
                )
            }
            .addOnFailureListener { error ->

                isDiscovering =
                    false

                Log.e(
                    "CrossDrag",
                    "Failed to start discovery",
                    error
                )
            }
    }


    /*
     * ============================================================
     * STOP DISCOVERY
     * ============================================================
     */

    fun stopDiscovery() {

        if (!isDiscovering) {

            Log.d(
                "CrossDrag",
                "Discovery already stopped"
            )

            return
        }

        connectionsClient.stopDiscovery()

        isDiscovering = false

        discoveredDevices.keys
            .toList()
            .forEach { endpointId ->

                onDeviceLost(
                    endpointId
                )
            }

        discoveredDevices.clear()

        Log.d(
            "CrossDrag",
            "Discovery stopped"
        )
    }
}