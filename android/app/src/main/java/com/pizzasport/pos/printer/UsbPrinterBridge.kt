package com.pizzasport.pos.printer

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Puente JS <-> impresora térmica USB (ESC/POS), expuesto al WebView vía:
 *   webView.addJavascriptInterface(UsbPrinterBridge(context), "AndroidPrinter")
 *
 * Contrato que espera js/utils/printer.js del proyecto PizzaSport POS:
 *   printBase64(base64: String): String   -> JSON síncrono
 *       {"success":true} | {"success":false,"error":"mensaje legible"}
 *   isConnected(): Boolean                -> hay impresora presente y con permiso
 *
 * Nota sobre threading: Android invoca los métodos @JavascriptInterface en un
 * hilo propio del WebView, NO en el hilo principal — por eso es seguro
 * bloquear aquí (latch.await) esperando el diálogo de permiso USB sin congelar
 * la UI.
 */
class UsbPrinterBridge(private val context: Context) {

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val actionUsbPermission = "${context.packageName}.USB_PERMISSION"

    @Volatile private var permissionLatch: CountDownLatch? = null
    @Volatile private var permissionGranted = false

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(receivedContext: Context, intent: Intent) {
            if (intent.action != actionUsbPermission) return
            synchronized(this) {
                permissionGranted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                permissionLatch?.countDown()
            }
        }
    }

    init {
        ContextCompat.registerReceiver(
            context,
            permissionReceiver,
            IntentFilter(actionUsbPermission),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    /** Llamar desde Activity.onDestroy() para no filtrar el receiver. */
    fun destroy() {
        try {
            context.unregisterReceiver(permissionReceiver)
        } catch (e: IllegalArgumentException) {
            // ya estaba desregistrado, ignorar
        }
    }

    @JavascriptInterface
    fun isConnected(): Boolean {
        val device = findPrinterDevice() ?: return false
        return usbManager.hasPermission(device)
    }

    @JavascriptInterface
    fun printBase64(base64: String): String {
        return try {
            val device = findPrinterDevice()
                ?: return errorJson("No se detectó ninguna impresora USB conectada")

            if (!usbManager.hasPermission(device) && !requestPermissionAndWait(device)) {
                return errorJson("Permiso USB no concedido. Revisa el diálogo de permisos en la tablet e intenta de nuevo.")
            }

            val usbInterface = findPrinterInterface(device)
                ?: return errorJson("La impresora no expone una interfaz USB compatible")

            val endpointOut = findBulkOutEndpoint(usbInterface)
                ?: return errorJson("La impresora no expone un endpoint de salida (bulk OUT)")

            val connection = usbManager.openDevice(device)
                ?: return errorJson("No se pudo abrir la conexión con la impresora")

            try {
                if (!connection.claimInterface(usbInterface, true)) {
                    return errorJson("No se pudo tomar el control de la interfaz USB (¿otra app la tiene abierta?)")
                }
                try {
                    sendInChunks(connection, endpointOut, Base64.decode(base64, Base64.DEFAULT))
                } finally {
                    connection.releaseInterface(usbInterface)
                }
                successJson()
            } finally {
                connection.close()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error imprimiendo", e)
            errorJson("Error inesperado: ${e.message}")
        }
    }

    // Muchas impresoras térmicas baratas tienen un buffer de recepción diminuto.
    // Enviar en trozos grandes y sin pausa (p.ej. al mandar el bitmap del logo)
    // lo desborda: el bulkTransfer falla a mitad de camino (se imprime solo una
    // parte y luego "bulkTransfer devolvió -1"). Trozos más chicos + una pausa
    // breve entre cada uno le dan tiempo a la impresora a vaciar su buffer.
    private fun sendInChunks(connection: UsbDeviceConnection, endpoint: UsbEndpoint, data: ByteArray) {
        var offset = 0
        while (offset < data.size) {
            val end = minOf(offset + CHUNK_SIZE, data.size)
            val chunk = data.copyOfRange(offset, end)
            var sent = connection.bulkTransfer(endpoint, chunk, chunk.size, TRANSFER_TIMEOUT_MS)
            if (sent < 0) {
                // Un solo reintento tras una pausa: suele bastar si la impresora
                // simplemente necesitaba drenar el buffer, no si el dato es
                // realmente demasiado grande para ella.
                Thread.sleep(CHUNK_RETRY_DELAY_MS)
                sent = connection.bulkTransfer(endpoint, chunk, chunk.size, TRANSFER_TIMEOUT_MS)
                if (sent < 0) throw RuntimeException("bulkTransfer devolvió $sent en el offset $offset")
            }
            offset = end
            if (offset < data.size) Thread.sleep(CHUNK_PACE_DELAY_MS)
        }
    }

    private fun requestPermissionAndWait(device: UsbDevice): Boolean {
        val latch = CountDownLatch(1)
        permissionLatch = latch
        permissionGranted = false

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val permissionIntent = PendingIntent.getBroadcast(context, 0, Intent(actionUsbPermission), flags)

        // requestPermission dispara un diálogo del sistema: se pide desde el hilo principal.
        mainHandler.post { usbManager.requestPermission(device, permissionIntent) }

        latch.await(PERMISSION_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        return permissionGranted
    }

    // Preferimos la interfaz declarada como USB_CLASS_PRINTER (estándar). Si el
    // fabricante la reporta como vendor-specific (0xFF, común en impresoras
    // genéricas baratas), usamos la primera interfaz con endpoint OUT bulk.
    private fun findPrinterInterface(device: UsbDevice): UsbInterface? {
        val interfaces = (0 until device.interfaceCount).map { device.getInterface(it) }
        return interfaces.firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_PRINTER }
            ?: interfaces.firstOrNull { findBulkOutEndpoint(it) != null }
    }

    private fun findBulkOutEndpoint(usbInterface: UsbInterface): UsbEndpoint? =
        (0 until usbInterface.endpointCount)
            .map { usbInterface.getEndpoint(it) }
            .firstOrNull { it.direction == UsbConstants.USB_DIR_OUT && it.type == UsbConstants.USB_ENDPOINT_XFER_BULK }

    private fun findPrinterDevice(): UsbDevice? =
        usbManager.deviceList.values.firstOrNull { findPrinterInterface(it) != null }

    private fun successJson() = JSONObject().put("success", true).toString()

    private fun errorJson(message: String): String {
        Log.w(TAG, message)
        return JSONObject().put("success", false).put("error", message).toString()
    }

    companion object {
        private const val TAG = "UsbPrinterBridge"
        private const val CHUNK_SIZE = 1024
        private const val CHUNK_PACE_DELAY_MS = 8L
        private const val CHUNK_RETRY_DELAY_MS = 60L
        private const val TRANSFER_TIMEOUT_MS = 5000
        private const val PERMISSION_TIMEOUT_MS = 15000L
    }
}
