package com.eazee.crossdrag.transfer

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract

class TransferDirectoryManager(
    context: Context
) {

    private val appContext =
        context.applicationContext


    private val preferences =
        appContext.getSharedPreferences(
            "magphone_transfer",
            Context.MODE_PRIVATE
        )


    private companion object {

        const val SAVE_DIRECTORY_URI =
            "save_directory_uri"
    }


    /*
     * ============================================================
     * SET DIRECTORY
     * ============================================================
     */

    fun setDirectory(
        uri: Uri
    ): Boolean {

        return try {

            val flags =
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION


            appContext.contentResolver
                .takePersistableUriPermission(
                    uri,
                    flags
                )


            preferences.edit()
                .putString(
                    SAVE_DIRECTORY_URI,
                    uri.toString()
                )
                .apply()


            true

        } catch (_: SecurityException) {

            false

        } catch (_: Exception) {

            false
        }
    }


    /*
     * ============================================================
     * GET DIRECTORY URI
     * ============================================================
     */

    fun getDirectoryUri():
            Uri? {

        val storedUri =
            preferences.getString(
                SAVE_DIRECTORY_URI,
                null
            )


        if (
            storedUri.isNullOrBlank()
        ) {

            return null
        }


        return try {

            Uri.parse(
                storedUri
            )

        } catch (_: Exception) {

            null
        }
    }


    /*
     * ============================================================
     * HAS DIRECTORY
     * ============================================================
     */

    fun hasDirectory():
            Boolean {

        return getDirectoryUri() != null
    }


    /*
     * ============================================================
     * CLEAR DIRECTORY
     * ============================================================
     */

    fun clearDirectory() {

        val uri =
            getDirectoryUri()


        if (
            uri != null
        ) {

            try {

                val flags =
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_GRANT_WRITE_URI_PERMISSION


                appContext.contentResolver
                    .releasePersistableUriPermission(
                        uri,
                        flags
                    )

            } catch (_: Exception) {
            }
        }


        preferences.edit()
            .remove(
                SAVE_DIRECTORY_URI
            )
            .apply()
    }


    /*
     * ============================================================
     * DIRECTORY NAME
     * ============================================================
     */

    fun getDirectoryName():
            String {

        val treeUri =
            getDirectoryUri()
                ?: return "Not selected"


        return try {

            val documentId =
                DocumentsContract
                    .getTreeDocumentId(
                        treeUri
                    )


            val documentUri =
                DocumentsContract
                    .buildDocumentUriUsingTree(
                        treeUri,
                        documentId
                    )


            val cursor =
                appContext.contentResolver
                    .query(
                        documentUri,
                        arrayOf(
                            DocumentsContract.Document.COLUMN_DISPLAY_NAME
                        ),
                        null,
                        null,
                        null
                    )


            var directoryName =
                "Selected folder"


            if (
                cursor != null
            ) {

                cursor.use {

                    if (
                        it.moveToFirst()
                    ) {

                        val nameIndex =
                            it.getColumnIndex(
                                DocumentsContract
                                    .Document
                                    .COLUMN_DISPLAY_NAME
                            )


                        if (
                            nameIndex >= 0
                        ) {

                            val name =
                                it.getString(
                                    nameIndex
                                )


                            if (
                                !name.isNullOrBlank()
                            ) {

                                directoryName =
                                    name
                            }
                        }
                    }
                }
            }


            directoryName

        } catch (_: Exception) {

            "Selected folder"
        }
    }


    /*
     * ============================================================
     * CREATE FILE
     * ============================================================
     */

    fun createFile(
        fileName: String,
        mimeType: String
    ): Uri? {

        val treeUri =
            getDirectoryUri()
                ?: return null


        return try {

            val documentId =
                DocumentsContract
                    .getTreeDocumentId(
                        treeUri
                    )


            val parentUri =
                DocumentsContract
                    .buildDocumentUriUsingTree(
                        treeUri,
                        documentId
                    )


            val safeMimeType =
                if (
                    mimeType.isBlank()
                ) {

                    "application/octet-stream"

                } else {

                    mimeType
                }


            var candidateName =
                fileName


            var counter =
                1


            while (
                documentExists(
                    parentUri,
                    candidateName
                )
            ) {

                candidateName =
                    buildDuplicateName(
                        fileName,
                        counter
                    )


                counter++
            }


            DocumentsContract.createDocument(
                appContext.contentResolver,
                parentUri,
                safeMimeType,
                candidateName
            )

        } catch (_: Exception) {

            null
        }
    }


    /*
     * ============================================================
     * CHECK EXISTING FILE
     * ============================================================
     */

    private fun documentExists(
        parentUri: Uri,
        fileName: String
    ): Boolean {

        return try {

            val documentId =
                DocumentsContract
                    .getDocumentId(
                        parentUri
                    )


            val childrenUri =
                DocumentsContract
                    .buildChildDocumentsUriUsingTree(
                        parentUri,
                        documentId
                    )


            val cursor =
                appContext.contentResolver
                    .query(
                        childrenUri,
                        arrayOf(
                            DocumentsContract.Document.COLUMN_DISPLAY_NAME
                        ),
                        "${DocumentsContract.Document.COLUMN_DISPLAY_NAME} = ?",
                        arrayOf(
                            fileName
                        ),
                        null
                    )


            if (
                cursor == null
            ) {

                false

            } else {

                cursor.use {

                    it.moveToFirst()
                }
            }

        } catch (_: Exception) {

            false
        }
    }


    /*
     * ============================================================
     * DUPLICATE FILENAME
     * ============================================================
     */

    private fun buildDuplicateName(
        fileName: String,
        number: Int
    ): String {

        val dotIndex =
            fileName.lastIndexOf(
                '.'
            )


        if (
            dotIndex <= 0
        ) {

            return "$fileName ($number)"
        }


        val baseName =
            fileName.substring(
                0,
                dotIndex
            )


        val extension =
            fileName.substring(
                dotIndex
            )


        return "$baseName ($number)$extension"
    }
}