package com.eazee.crossdrag.transfer

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.MimeTypeMap
import com.eazee.crossdrag.connection.ConnectionManager
import com.eazee.crossdrag.protocol.Message
import com.eazee.crossdrag.protocol.MessageType
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

class TransferManager(
    private val context: Context,
    private val connectionManager: ConnectionManager,
    private val directoryManager: TransferDirectoryManager,
    private val onStateChanged: (TransferState) -> Unit,
    private val onProgressChanged: (Int) -> Unit,
    private val onIncomingTransfer: (TransferManifest) -> Unit,
    private val onTransferComplete: (
        TransferManifest,
        Uri?
    ) -> Unit,
    private val onError: (String) -> Unit
) {

    private data class OutgoingTransfer(
        val endpointId: String,
        val uri: Uri,
        val manifest: TransferManifest,
        var payloadId: Long? = null,
        var payloadFinished: Boolean = false,
        var receiverConfirmed: Boolean = false
    )


    private data class IncomingTransfer(
        val endpointId: String,
        val manifest: TransferManifest,
        var payload: Payload? = null
    )


    private val appContext =
        context.applicationContext


    private val localDeviceInfo =
        DeviceTransferInfo(
            name =
                Build.MODEL,

            model =
                Build.MODEL,

            androidVersion =
                Build.VERSION.SDK_INT,

            appVersion =
                "1.0"
        )


    private var outgoingTransfer:
            OutgoingTransfer? = null


    private var incomingTransfer:
            IncomingTransfer? = null


    private val outgoingPayloads =
        mutableMapOf<Long, TransferManifest>()


    private val incomingPayloads =
        mutableMapOf<Long, TransferManifest>()


    /*
     * ============================================================
     * SEND FILE
     * ============================================================
     */

    fun sendFile(
        endpointId: String,
        uri: Uri,
        receiver: DeviceTransferInfo
    ) {

        if (
            !connectionManager.isConnected(
                endpointId
            )
        ) {

            onError(
                "Device is not connected"
            )

            return
        }


        if (
            outgoingTransfer != null
        ) {

            onError(
                "A file transfer is already running"
            )

            return
        }


        try {

            val fileName =
                getFileName(
                    uri
                )


            val fileSize =
                getFileSize(
                    uri
                )


            val mimeType =
                getMimeType(
                    uri,
                    fileName
                )


            val extension =
                getExtension(
                    fileName
                )


            val iconType =
                getIconType(
                    mimeType,
                    extension
                )


            val modifiedTime =
                getModifiedTime(
                    uri
                )


            val manifest =
                TransferManifest(

                    transferId =
                        UUID.randomUUID()
                            .toString(),

                    sender =
                        localDeviceInfo,

                    receiver =
                        receiver,

                    file =
                        FileTransferInfo(

                            name =
                                fileName,

                            size =
                                fileSize,

                            mimeType =
                                mimeType,

                            extension =
                                extension,

                            iconType =
                                iconType,

                            modifiedTime =
                                modifiedTime
                        ),

                    createdAt =
                        System.currentTimeMillis()
                )


            outgoingTransfer =
                OutgoingTransfer(
                    endpointId =
                        endpointId,

                    uri =
                        uri,

                    manifest =
                        manifest
                )


            onProgressChanged(
                0
            )


            onStateChanged(
                TransferState.REQUESTING
            )


            connectionManager.sendMessage(
                endpointId,
                Message(
                    type =
                        MessageType.FILE_REQUEST,

                    data =
                        TransferManifestJson.encode(
                            manifest
                        )
                )
            )


            Log.d(
                "CrossDragTransfer",
                "FILE_REQUEST sent for ${manifest.file.name}"
            )

        } catch (error: Exception) {

            outgoingTransfer =
                null


            onStateChanged(
                TransferState.FAILED
            )


            onError(
                "Could not prepare file: " +
                        (
                                error.message
                                    ?: "unknown error"
                                )
            )
        }
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

            MessageType.FILE_REQUEST -> {

                handleFileRequest(
                    endpointId,
                    message
                )
            }


            MessageType.FILE_ACCEPT -> {

                handleFileAccept(
                    endpointId,
                    message
                )
            }


            MessageType.FILE_REJECT -> {

                handleFileReject(
                    endpointId,
                    message
                )
            }


            MessageType.FILE_COMPLETE -> {

                handleFileComplete(
                    endpointId,
                    message
                )
            }


            MessageType.FILE_CANCEL -> {

                handleFileCancel(
                    endpointId,
                    message
                )
            }
        }
    }


    /*
     * ============================================================
     * INCOMING FILE REQUEST
     * ============================================================
     */

    private fun handleFileRequest(
        endpointId: String,
        message: Message
    ) {

        try {

            if (
                incomingTransfer != null
            ) {

                sendReject(
                    endpointId,
                    "A transfer is already running"
                )

                return
            }


            val manifest =
                TransferManifestJson.decode(
                    message.data
                )


            if (
                !isForThisDevice(
                    manifest.receiver
                )
            ) {

                sendReject(
                    endpointId,
                    "Transfer is intended for another device"
                )

                return
            }


            incomingTransfer =
                IncomingTransfer(
                    endpointId =
                        endpointId,

                    manifest =
                        manifest
                )


            onStateChanged(
                TransferState.REQUESTING
            )


            onProgressChanged(
                0
            )


            onIncomingTransfer(
                manifest
            )


            Log.d(
                "CrossDragTransfer",
                "Incoming request: " +
                        manifest.file.name
            )


            /*
             * If a save directory has already been configured,
             * accept immediately.
             *
             * Otherwise wait for the user to configure one.
             */

            if (
                directoryManager.hasDirectory()
            ) {

                acceptIncomingTransfer()
            }

        } catch (error: Exception) {

            Log.e(
                "CrossDragTransfer",
                "Invalid FILE_REQUEST",
                error
            )


            sendReject(
                endpointId,
                "Invalid transfer manifest"
            )


            onStateChanged(
                TransferState.FAILED
            )


            onError(
                "Invalid file request"
            )
        }
    }


    /*
     * ============================================================
     * SET SAVE DIRECTORY
     * ============================================================
     */

    fun setSaveDirectory(
        uri: Uri
    ): Boolean {

        val saved =
            directoryManager.setDirectory(
                uri
            )


        if (
            saved
        ) {

            val transfer =
                incomingTransfer


            if (
                transfer != null
            ) {

                acceptIncomingTransfer()
            }
        }


        return saved
    }


    /*
     * ============================================================
     * GET SAVE DIRECTORY
     * ============================================================
     */

    fun getSaveDirectoryName():
            String {

        return directoryManager
            .getDirectoryName()
    }


    /*
     * ============================================================
     * CLEAR SAVE DIRECTORY
     * ============================================================
     */

    fun clearSaveDirectory() {

        directoryManager.clearDirectory()
    }


    /*
     * ============================================================
     * ACCEPT INCOMING
     * ============================================================
     */

    fun acceptIncomingTransfer() {

        val transfer =
            incomingTransfer
                ?: return


        if (
            !connectionManager.isConnected(
                transfer.endpointId
            )
        ) {

            incomingTransfer =
                null


            onStateChanged(
                TransferState.FAILED
            )


            onError(
                "Sender is no longer connected"
            )

            return
        }


        if (
            !directoryManager.hasDirectory()
        ) {

            onError(
                "Choose a save folder first"
            )

            return
        }


        val data =
            JSONObject().apply {

                put(
                    "transferId",
                    transfer.manifest.transferId
                )
            }


        connectionManager.sendMessage(
            transfer.endpointId,
            Message(
                type =
                    MessageType.FILE_ACCEPT,

                data =
                    data.toString()
            )
        )


        onStateChanged(
            TransferState.RECEIVING
        )


        Log.d(
            "CrossDragTransfer",
            "Accepted incoming transfer: " +
                    transfer.manifest.file.name
        )
    }


    /*
     * ============================================================
     * REJECT INCOMING
     * ============================================================
     */

    fun rejectIncomingTransfer(
        reason: String
    ) {

        val transfer =
            incomingTransfer
                ?: return


        sendReject(
            transfer.endpointId,
            reason
        )


        transfer.payload?.close()


        incomingTransfer =
            null


        incomingPayloads.clear()


        onStateChanged(
            TransferState.CANCELLED
        )
    }


    /*
     * ============================================================
     * FILE ACCEPT
     * ============================================================
     */

    private fun handleFileAccept(
        endpointId: String,
        message: Message
    ) {

        val transfer =
            outgoingTransfer


        if (
            transfer == null ||
            transfer.endpointId != endpointId
        ) {

            return
        }


        val transferId =
            try {

                JSONObject(
                    message.data
                ).optString(
                    "transferId"
                )

            } catch (_: Exception) {

                ""
            }


        if (
            transferId !=
            transfer.manifest.transferId
        ) {

            return
        }


        val payloadId =
            connectionManager.sendFile(
                endpointId,
                transfer.uri,
                transfer.manifest.file.name
            )


        if (
            payloadId == null
        ) {

            failOutgoing(
                "Could not start file transfer"
            )

            return
        }


        transfer.payloadId =
            payloadId


        outgoingPayloads[
            payloadId
        ] =
            transfer.manifest


        onStateChanged(
            TransferState.TRANSFERRING
        )


        onProgressChanged(
            0
        )


        Log.d(
            "CrossDragTransfer",
            "File payload started: $payloadId"
        )
    }


    /*
     * ============================================================
     * FILE REJECT
     * ============================================================
     */

    private fun handleFileReject(
        endpointId: String,
        message: Message
    ) {

        val transfer =
            outgoingTransfer


        if (
            transfer == null ||
            transfer.endpointId != endpointId
        ) {

            return
        }


        val reason =
            try {

                JSONObject(
                    message.data
                ).optString(
                    "reason",
                    "Transfer rejected"
                )

            } catch (_: Exception) {

                "Transfer rejected"
            }


        failOutgoing(
            reason
        )
    }


    /*
     * ============================================================
     * FILE COMPLETE
     * ============================================================
     */

    private fun handleFileComplete(
        endpointId: String,
        message: Message
    ) {

        val transfer =
            outgoingTransfer


        if (
            transfer == null ||
            transfer.endpointId != endpointId
        ) {

            return
        }


        val transferId =
            try {

                JSONObject(
                    message.data
                ).optString(
                    "transferId"
                )

            } catch (_: Exception) {

                ""
            }


        if (
            transferId !=
            transfer.manifest.transferId
        ) {

            return
        }


        transfer.receiverConfirmed =
            true


        if (
            transfer.payloadFinished
        ) {

            finishOutgoing(
                transfer
            )
        }
    }


    /*
     * ============================================================
     * FILE CANCEL
     * ============================================================
     */

    private fun handleFileCancel(
        endpointId: String,
        message: Message
    ) {

        val outgoing =
            outgoingTransfer


        if (
            outgoing != null &&
            outgoing.endpointId == endpointId
        ) {

            outgoing.payloadId?.let {
                connectionManager.cancelPayload(
                    it
                )
            }


            outgoing.payloadId?.let {
                outgoingPayloads.remove(
                    it
                )
            }


            outgoingTransfer =
                null
        }


        val incoming =
            incomingTransfer


        if (
            incoming != null &&
            incoming.endpointId == endpointId
        ) {

            incoming.payload?.close()


            incomingTransfer =
                null


            incomingPayloads.clear()
        }


        onStateChanged(
            TransferState.CANCELLED
        )


        onError(
            "Transfer cancelled"
        )
    }


    /*
     * ============================================================
     * FILE PAYLOAD RECEIVED
     * ============================================================
     */

    fun handleFilePayload(
        endpointId: String,
        payload: Payload
    ) {

        val transfer =
            incomingTransfer


        if (
            transfer == null ||
            transfer.endpointId != endpointId
        ) {

            Log.d(
                "CrossDragTransfer",
                "Unexpected file payload"
            )


            payload.close()


            return
        }


        transfer.payload =
            payload


        incomingPayloads[
            payload.id
        ] =
            transfer.manifest


        onStateChanged(
            TransferState.RECEIVING
        )


        Log.d(
            "CrossDragTransfer",
            "Receiving file payload ${payload.id}"
        )
    }


    /*
     * ============================================================
     * TRANSFER UPDATE
     * ============================================================
     */

    fun handleTransferUpdate(
        endpointId: String,
        update: PayloadTransferUpdate
    ) {

        val payloadId =
            update.payloadId


        val outgoingManifest =
            outgoingPayloads[
                payloadId
            ]


        if (
            outgoingManifest != null
        ) {

            handleOutgoingUpdate(
                endpointId,
                update,
                outgoingManifest
            )

            return
        }


        val incomingManifest =
            incomingPayloads[
                payloadId
            ]


        if (
            incomingManifest != null
        ) {

            handleIncomingUpdate(
                endpointId,
                update,
                incomingManifest
            )
        }
    }


    /*
     * ============================================================
     * OUTGOING UPDATE
     * ============================================================
     */

    private fun handleOutgoingUpdate(
        endpointId: String,
        update: PayloadTransferUpdate,
        manifest: TransferManifest
    ) {

        val transfer =
            outgoingTransfer


        if (
            transfer == null ||
            transfer.endpointId != endpointId
        ) {

            return
        }


        when (
            update.status
        ) {

            PayloadTransferUpdate.Status.IN_PROGRESS -> {

                val total =
                    update.totalBytes

                val transferred =
                    update.bytesTransferred


                if (
                    total > 0
                ) {

                    val progress =
                        (
                                transferred * 100L
                                ) / total


                    onProgressChanged(
                        progress.toInt()
                            .coerceIn(
                                0,
                                100
                            )
                    )
                }


                onStateChanged(
                    TransferState.TRANSFERRING
                )
            }


            PayloadTransferUpdate.Status.SUCCESS -> {

                transfer.payloadFinished =
                    true


                onProgressChanged(
                    100
                )


                Log.d(
                    "CrossDragTransfer",
                    "File payload finished"
                )


                if (
                    transfer.receiverConfirmed
                ) {

                    finishOutgoing(
                        transfer
                    )
                }
            }


            PayloadTransferUpdate.Status.FAILURE -> {

                outgoingPayloads.remove(
                    update.payloadId
                )


                failOutgoing(
                    "File transfer failed"
                )
            }


            PayloadTransferUpdate.Status.CANCELED -> {

                outgoingPayloads.remove(
                    update.payloadId
                )


                failOutgoing(
                    "File transfer cancelled"
                )
            }
        }
    }


    /*
     * ============================================================
     * INCOMING UPDATE
     * ============================================================
     */

    private fun handleIncomingUpdate(
        endpointId: String,
        update: PayloadTransferUpdate,
        manifest: TransferManifest
    ) {

        val transfer =
            incomingTransfer


        if (
            transfer == null ||
            transfer.endpointId != endpointId
        ) {

            return
        }


        when (
            update.status
        ) {

            PayloadTransferUpdate.Status.IN_PROGRESS -> {

                val total =
                    update.totalBytes

                val transferred =
                    update.bytesTransferred


                if (
                    total > 0
                ) {

                    val progress =
                        (
                                transferred * 100L
                                ) / total


                    onProgressChanged(
                        progress.toInt()
                            .coerceIn(
                                0,
                                100
                            )
                    )
                }


                onStateChanged(
                    TransferState.RECEIVING
                )
            }


            PayloadTransferUpdate.Status.SUCCESS -> {

                val payload =
                    transfer.payload


                if (
                    payload == null
                ) {

                    failIncoming(
                        "Received file payload is missing"
                    )

                    return
                }


                val saveUri =
                    directoryManager.createFile(
                        fileName =
                            manifest.file.name,

                        mimeType =
                            manifest.file.mimeType
                    )


                if (
                    saveUri == null
                ) {

                    payload.close()


                    failIncoming(
                        "Could not create file in save folder"
                    )

                    return
                }


                try {

                    copyReceivedFile(
                        payload,
                        saveUri
                    )


                    onProgressChanged(
                        100
                    )


                    onStateChanged(
                        TransferState.COMPLETE
                    )


                    val completeData =
                        JSONObject().apply {

                            put(
                                "transferId",
                                manifest.transferId
                            )

                            put(
                                "fileName",
                                manifest.file.name
                            )
                        }


                    connectionManager.sendMessage(
                        endpointId,
                        Message(
                            type =
                                MessageType.FILE_COMPLETE,

                            data =
                                completeData.toString()
                        )
                    )


                    onTransferComplete(
                        manifest,
                        saveUri
                    )


                    payload.close()


                    incomingPayloads.remove(
                        update.payloadId
                    )


                    incomingTransfer =
                        null


                    Log.d(
                        "CrossDragTransfer",
                        "File saved successfully: " +
                                manifest.file.name
                    )

                } catch (error: Exception) {

                    Log.e(
                        "CrossDragTransfer",
                        "Failed to save received file",
                        error
                    )


                    try {
                        payload.close()
                    } catch (_: Exception) {
                    }


                    try {
                        appContext.contentResolver.delete(
                            saveUri,
                            null,
                            null
                        )
                    } catch (_: Exception) {
                    }


                    failIncoming(
                        "Could not save received file: " +
                                (
                                        error.message
                                            ?: "unknown error"
                                        )
                    )
                }
            }


            PayloadTransferUpdate.Status.FAILURE -> {

                failIncoming(
                    "Incoming file transfer failed"
                )
            }


            PayloadTransferUpdate.Status.CANCELED -> {

                incomingTransfer
                    ?.payload
                    ?.close()


                incomingTransfer =
                    null


                incomingPayloads.clear()


                onStateChanged(
                    TransferState.CANCELLED
                )


                onError(
                    "Incoming file transfer cancelled"
                )
            }
        }
    }


    /*
     * ============================================================
     * FINISH OUTGOING
     * ============================================================
     */

    private fun finishOutgoing(
        transfer: OutgoingTransfer
    ) {

        outgoingPayloads.remove(
            transfer.payloadId
        )


        outgoingTransfer =
            null


        onProgressChanged(
            100
        )


        onStateChanged(
            TransferState.COMPLETE
        )


        onTransferComplete(
            transfer.manifest,
            null
        )


        Log.d(
            "CrossDragTransfer",
            "Outgoing transfer complete"
        )
    }


    /*
     * ============================================================
     * COPY RECEIVED FILE
     * ============================================================
     */

    private fun copyReceivedFile(
        payload: Payload,
        destinationUri: Uri
    ) {

        val sourceUri =
            payload
                .asFile()
                ?.asUri()


        if (
            sourceUri == null
        ) {

            throw IOException(
                "Received file URI is unavailable"
            )
        }


        val input =
            appContext.contentResolver
                .openInputStream(
                    sourceUri
                )
                ?: throw IOException(
                    "Could not open received file"
                )


        val output =
            appContext.contentResolver
                .openOutputStream(
                    destinationUri,
                    "w"
                )
                ?: throw IOException(
                    "Could not open destination file"
                )


        input.use {
                source ->

            output.use {
                    destination ->

                source.copyTo(
                    destination
                )
            }
        }
    }


    /*
     * ============================================================
     * DEVICE VALIDATION
     * ============================================================
     */

    private fun isForThisDevice(
        receiver: DeviceTransferInfo
    ): Boolean {

        return receiver.model ==
                localDeviceInfo.model
    }


    /*
     * ============================================================
     * FAIL OUTGOING
     * ============================================================
     */

    private fun failOutgoing(
        reason: String
    ) {

        outgoingTransfer
            ?.payloadId
            ?.let {
                outgoingPayloads.remove(
                    it
                )
            }


        outgoingTransfer =
            null


        onStateChanged(
            TransferState.FAILED
        )


        onError(
            reason
        )
    }


    /*
     * ============================================================
     * FAIL INCOMING
     * ============================================================
     */

    private fun failIncoming(
        reason: String
    ) {

        incomingTransfer
            ?.payload
            ?.close()


        incomingTransfer =
            null


        incomingPayloads.clear()


        onStateChanged(
            TransferState.FAILED
        )


        onError(
            reason
        )
    }


    /*
     * ============================================================
     * SEND REJECT
     * ============================================================
     */

    private fun sendReject(
        endpointId: String,
        reason: String
    ) {

        val data =
            JSONObject().apply {

                put(
                    "reason",
                    reason
                )
            }


        connectionManager.sendMessage(
            endpointId,
            Message(
                type =
                    MessageType.FILE_REJECT,

                data =
                    data.toString()
            )
        )
    }


    /*
     * ============================================================
     * FILE NAME
     * ============================================================
     */

    private fun getFileName(
        uri: Uri
    ): String {

        appContext.contentResolver
            .query(
                uri,
                arrayOf(
                    OpenableColumns.DISPLAY_NAME
                ),
                null,
                null,
                null
            )
            ?.use { cursor ->

                if (
                    cursor.moveToFirst()
                ) {

                    val index =
                        cursor.getColumnIndex(
                            OpenableColumns.DISPLAY_NAME
                        )


                    if (
                        index >= 0
                    ) {

                        val name =
                            cursor.getString(
                                index
                            )


                        if (
                            !name.isNullOrBlank()
                        ) {

                            return name
                        }
                    }
                }
            }


        return "file"
    }


    /*
     * ============================================================
     * FILE SIZE
     * ============================================================
     */

    private fun getFileSize(
        uri: Uri
    ): Long {

        appContext.contentResolver
            .query(
                uri,
                arrayOf(
                    OpenableColumns.SIZE
                ),
                null,
                null,
                null
            )
            ?.use { cursor ->

                if (
                    cursor.moveToFirst()
                ) {

                    val index =
                        cursor.getColumnIndex(
                            OpenableColumns.SIZE
                        )


                    if (
                        index >= 0 &&
                        !cursor.isNull(index)
                    ) {

                        return cursor.getLong(
                            index
                        )
                    }
                }
            }


        return -1L
    }


    /*
     * ============================================================
     * MIME TYPE
     * ============================================================
     */

    private fun getMimeType(
        uri: Uri,
        fileName: String
    ): String {

        val directType =
            appContext.contentResolver
                .getType(
                    uri
                )


        if (
            !directType.isNullOrBlank()
        ) {

            return directType
        }


        return MimeTypeMap
            .getSingleton()
            .getMimeTypeFromExtension(
                getExtension(
                    fileName
                )
            )
            ?: "application/octet-stream"
    }


    /*
     * ============================================================
     * EXTENSION
     * ============================================================
     */

    private fun getExtension(
        fileName: String
    ): String {

        val dot =
            fileName.lastIndexOf(
                '.'
            )


        if (
            dot < 0 ||
            dot == fileName.lastIndex
        ) {

            return ""
        }


        return fileName
            .substring(
                dot + 1
            )
            .lowercase()
    }


    /*
     * ============================================================
     * ICON TYPE
     * ============================================================
     */

    private fun getIconType(
        mimeType: String,
        extension: String
    ): String {

        return when {

            mimeType.startsWith(
                "image/"
            ) ->
                "image"

            mimeType.startsWith(
                "video/"
            ) ->
                "video"

            mimeType.startsWith(
                "audio/"
            ) ->
                "audio"

            mimeType ==
                    "application/pdf" ->
                "pdf"

            mimeType.startsWith(
                "text/"
            ) ->
                "text"

            extension in setOf(
                "zip",
                "7z",
                "rar",
                "tar",
                "gz"
            ) ->
                "archive"

            extension in setOf(
                "xls",
                "xlsx",
                "csv"
            ) ->
                "spreadsheet"

            extension in setOf(
                "ppt",
                "pptx"
            ) ->
                "presentation"

            mimeType.startsWith(
                "application/"
            ) ->
                "document"

            else ->
                "file"
        }
    }


    /*
     * ============================================================
     * MODIFIED TIME
     * ============================================================
     */

    private fun getModifiedTime(
        uri: Uri
    ): Long {

        return 0L
    }
}