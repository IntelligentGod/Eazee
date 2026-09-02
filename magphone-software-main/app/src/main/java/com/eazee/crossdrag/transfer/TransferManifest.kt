package com.eazee.crossdrag.transfer

data class TransferManifest(
    val transferId: String,
    val sender: DeviceTransferInfo,
    val receiver: DeviceTransferInfo,
    val file: FileTransferInfo,
    val createdAt: Long
)


data class DeviceTransferInfo(
    val name: String,
    val model: String,
    val androidVersion: Int,
    val appVersion: String
)


data class FileTransferInfo(
    val name: String,
    val size: Long,
    val mimeType: String,
    val extension: String,
    val iconType: String,
    val modifiedTime: Long
)