package com.example.flightoflegends

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import java.io.IOException

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw edge-to-edge so the game fills the entire screen including notch areas
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // Hide system bars (status bar + navigation bar) for immersive fullscreen gameplay
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.systemBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        }

        // Configure the WebView
        webView = WebView(this).also { wv ->

            wv.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true           // localStorage for progress saving
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false  // Autoplay sounds
                cacheMode = WebSettings.LOAD_NO_CACHE      // Disable cache for testing
                useWideViewPort = true
                loadWithOverviewMode = true
                
                // Allow cross-origin requests from file/local URLs
                allowFileAccessFromFileURLs = true
                allowUniversalAccessFromFileURLs = true
                
                // Hardware acceleration
                wv.setLayerType(View.LAYER_TYPE_HARDWARE, null)
            }

            // Use WebChromeClient for JS console + permissions
            wv.webChromeClient = WebChromeClient()
            
            // Intercept all requests under https://localapp/ to serve assets locally.
            // This bypasses file:// protocol security restrictions on ES Modules (type="module")
            wv.webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val url = request?.url ?: return null
                    
                    // Intercept and serve locally
                    if (url.host == "localapp") {
                        val path = url.path ?: return null
                        try {
                            // Map the URL path (e.g. "/assets/index.js") to the android assets (e.g. "dist/assets/index.js")
                            // Strip leading slash from path to prevent malformed asset paths
                            val cleanPath = if (path.startsWith("/")) path.substring(1) else path
                            val assetPath = "dist/$cleanPath"
                            
                            val inputStream = assets.open(assetPath)
                            val mimeType = when {
                                path.endsWith(".html") -> "text/html"
                                path.endsWith(".css") -> "text/css"
                                path.endsWith(".js") -> "application/javascript"
                                path.endsWith(".svg") -> "image/svg+xml"
                                path.endsWith(".png") -> "image/png"
                                path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
                                path.endsWith(".json") -> "application/json"
                                path.endsWith(".woff") -> "font/woff"
                                path.endsWith(".woff2") -> "font/woff2"
                                path.endsWith(".ttf") -> "font/ttf"
                                else -> "application/octet-stream"
                            }
                            
                            return WebResourceResponse(mimeType, "UTF-8", inputStream)
                        } catch (e: IOException) {
                            // Fallback if resource not found
                            e.printStackTrace()
                        }
                    }
                    return super.shouldInterceptRequest(view, request)
                }
            }

            // Load the index page over a secure local domain.
            // This treats the app as standard HTTPS, enabling full ES Module loading.
            wv.loadUrl("https://localapp/index.html")
        }

        setContentView(webView)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
