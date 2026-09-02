package com.eazee.crossdrag.transfer

enum class TransferState {

    IDLE,

    REQUESTING,

    TRANSFERRING,

    RECEIVING,

    COMPLETE,

    FAILED,

    CANCELLED
}