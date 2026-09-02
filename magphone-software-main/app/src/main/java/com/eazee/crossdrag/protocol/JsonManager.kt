package com.eazee.crossdrag.protocol

import com.eazee.crossdrag.device.DeviceInfo
import org.json.JSONObject

object JsonManager {

    fun encode(
        message: Message
    ): String {

        val json =
            JSONObject()

        json.put(
            "type",
            message.type
        )

        json.put(
            "data",
            message.data
        )

        return json.toString()
    }


    fun decode(
        jsonString: String
    ): Message {

        val json =
            JSONObject(
                jsonString
            )

        return Message(
            json.getString("type"),
            json.getString("data")
        )
    }


    fun encodeDeviceInfo(
        deviceInfo: DeviceInfo
    ): String {

        val json =
            JSONObject()

        json.put(
            "name",
            deviceInfo.name
        )

        json.put(
            "model",
            deviceInfo.model
        )

        json.put(
            "androidVersion",
            deviceInfo.androidVersion
        )

        json.put(
            "appVersion",
            deviceInfo.appVersion
        )

        return json.toString()
    }


    fun decodeDeviceInfo(
        jsonString: String
    ): DeviceInfo {

        val json =
            JSONObject(
                jsonString
            )

        return DeviceInfo(
            name =
                json.getString("name"),

            model =
                json.getString("model"),

            androidVersion =
                json.getInt("androidVersion"),

            appVersion =
                json.getString("appVersion")
        )
    }
}