package com.pizzasport.pos

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.pizzasport.pos.printer.UsbPrinterBridge

/**
 * Contenedor WebView de PizzaSport POS en modo kiosco:
 *  - Pantalla completa, sin barra de navegación, pantalla siempre encendida.
 *  - Botón atrás pide confirmación (evita salir por accidente durante un turno).
 *  - Mantener presionada la pantalla 1s abre un diálogo para configurar la IP
 *    del servidor (útil al desplegar la misma app en varias tablets).
 *  - Inyecta el puente "AndroidPrinter" que habla ESC/POS con la impresora USB.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var printerBridge: UsbPrinterBridge
    private lateinit var prefs: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        hideSystemBars()

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        webView = findViewById(R.id.webview)
        setupWebView()

        printerBridge = UsbPrinterBridge(this)
        webView.addJavascriptInterface(printerBridge, "AndroidPrinter")

        webView.setOnLongClickListener {
            showServerUrlDialog()
            true
        }

        loadServerUrl()
    }

    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.setSupportZoom(false)

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                Log.e(TAG, "Error cargando $failingUrl: $description")
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                Log.d(TAG, "JS console: ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }
        }
    }

    private fun loadServerUrl() {
        val url = prefs.getString(PREF_SERVER_URL, getString(R.string.default_server_url))!!
        webView.loadUrl(url)
    }

    private fun showServerUrlDialog() {
        val input = EditText(this)
        input.setText(prefs.getString(PREF_SERVER_URL, getString(R.string.default_server_url)))

        AlertDialog.Builder(this)
            .setTitle("Dirección del servidor")
            .setMessage("Ej: http://192.168.1.50:3000")
            .setView(input)
            .setPositiveButton("Guardar") { _, _ ->
                val url = input.text.toString().trim()
                if (url.isNotEmpty()) {
                    prefs.edit().putString(PREF_SERVER_URL, url).apply()
                    webView.loadUrl(url)
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onBackPressed() {
        AlertDialog.Builder(this)
            .setTitle("¿Salir de PizzaSport POS?")
            .setPositiveButton("Salir") { _, _ -> super.onBackPressed() }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    override fun onDestroy() {
        printerBridge.destroy()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "PizzaSportPOS"
        private const val PREFS_NAME = "pizzasport_prefs"
        private const val PREF_SERVER_URL = "server_url"
    }
}
