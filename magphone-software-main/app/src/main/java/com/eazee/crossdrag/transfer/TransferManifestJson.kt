package com.eazee.crossdrag.transfer

import org.json.JSONObject

object TransferManifestJson {

    fun encode(
        manifest: TransferManifest
    ): String {

        val json =
            JSONObject()

        json.put(
            "transferId",
            manifest.transferId
        )

        json.put(
            "createdAt",
            manifest.createdAt
        )


        val sender =
            JSONObject()

        sender.put(
            "name",
            manifest.sender.name
        )

        sender.put(
            "model",
            manifest.sender.model
        )

        sender.put(
            "androidVersion",
            manifest.sender.androidVersion
        )

        sender.put(
            "appVersion",
            manifest.sender.appVersion
        )


        json.put(
            "sender",
            sender
        )


        val receiver =
            JSONObject()

        receiver.put(
            "name",
            manifest.receiver.name
        )

        receiver.put(
            "model",
            manifest.receiver.model
        )

        receiver.put(
            "androidVersion",
            manifest.receiver.androidVersion
        )

        receiver.put(
            "appVersion",
            manifest.receiver.appVersion
        )


        json.put(
            "receiver",
            receiver
        )


        val file =
            JSONObject()

        file.put(
            "name",
            manifest.file.name
        )

        file.put(
            "size",
            manifest.file.size
        )

        file.put(
            "mimeType",
            manifest.file.mimeType
        )

        file.put(
            "extension",
            manifest.file.extension
        )

        file.put(
            "iconType",
            manifest.file.iconType
        )

        file.put(
            "modifiedTime",
            manifest.file.modifiedTime
        )


        json.put(
            "file",
            file
        )


        return json.toString()
    }


    fun decode(
        jsonString: String
    ): TransferManifest {

        val json =
            JSONObject(
                jsonString
            )


        val senderJson =
            json.getJSONObject(
                "sender"
            )


        val receiverJson =
            json.getJSONObject(
                "receiver"
            )


        val fileJson =
            json.getJSONObject(
                "file"
            )


        return TransferManifest(

            transferId =
                json.getString(
                    "transferId"
                ),

            createdAt =
                json.getLong(
                    "createdAt"
                ),

            sender =
                DeviceTransferInfo(

                    name =
                        senderJson.getString(
                            "name"
                        ),

                    model =
                        senderJson.getString(
                            "model"
                        ),

                    androidVersion =
                        senderJson.getInt(
                            "androidVersion"
                        ),

                    appVersion =
                        senderJson.getString(
                            "appVersion"
                        )
                ),

            receiver =
                DeviceTransferInfo(

                    name =
                        receiverJson.getString(
                            "name"
                        ),

                    model =
                        receiverJson.getString(
                            "model"
                        ),

                    androidVersion =
                        receiverJson.getInt(
                            "androidVersion"
                        ),

                    appVersion =
                        receiverJson.getString(
                            "appVersion"
                        )
                ),

            file =
                FileTransferInfo(

                    name =
                        fileJson.getString(
                            "name"
                        ),

                    size =
                        fileJson.getLong(
                            "size"
                        ),

                    mimeType =
                        fileJson.getString(
                            "mimeType"
                        ),

                    extension =
                        fileJson.getString(
                            "extension"
                        ),

                    iconType =
                        fileJson.getString(
                            "iconType"
                        ),

                    modifiedTime =
                        fileJson.getLong(
                            "modifiedTime"
                        )
                )
        )
    }
}