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
import android.webkit.JavascriptInterface
import android.widget.FrameLayout
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAd
import com.google.android.gms.ads.rewardedinterstitial.RewardedInterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback

// Unity Ads imports
import com.unity3d.ads.UnityAds
import com.unity3d.ads.IUnityAdsInitializationListener
import com.unity3d.ads.IUnityAdsLoadListener
import com.unity3d.ads.IUnityAdsShowListener
import com.unity3d.ads.UnityAdsShowOptions
import com.unity3d.ads.UnityAds.UnityAdsInitializationError
import com.unity3d.ads.UnityAds.UnityAdsLoadError
import com.unity3d.ads.UnityAds.UnityAdsShowError
import java.io.IOException

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var rootLayout: FrameLayout
    private var rewardedInterstitialAd: RewardedInterstitialAd? = null
    private var rewardedAd: RewardedAd? = null

    // AdMob loading and retry state
    private var isInterstitialLoading = false
    private var interstitialRetryCount = 0
    private var isRewardedLoading = false
    private var rewardedRetryCount = 0

    // Unity Ads state
    private val unityGameId = "800083217" // Real Game ID
    private val unityRewardedPlacement = "Rewarded_Android" // Real rewarded placement
    private val unityInterstitialPlacement = "Interstitial_Android" // Real interstitial placement
    private var isUnityAdsInitialized = false
    private var isUnityRewardedLoaded = false
    private var isUnityInterstitialLoaded = false
    private var isUnityRewardedLoading = false
    private var unityRewardedRetryCount = 0
    private var isUnityInterstitialLoading = false
    private var unityInterstitialRetryCount = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d("FLIGHT_OF_LEGENDS_STARTUP", "onCreate() started. Device SDK API Level: ${android.os.Build.VERSION.SDK_INT}")

        // 1. Fullscreen Settings Configuration
        try {
            // Force hardware acceleration at the window level for ultra-smooth 2D canvas rendering
            window.setFlags(
                android.view.WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                android.view.WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
            )

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
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to apply fullscreen style configurations", e)
        }

        // 2. Programmatically verify required application permissions
        verifyPermissions()

        // 3. Initialize WebView and UI Layout elements
        try {
            webView = WebView(this).also { wv ->
                wv.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true           // localStorage for progress saving
                    databaseEnabled = true             // Enable database storage API
                    allowFileAccess = true
                    allowContentAccess = true
                    mediaPlaybackRequiresUserGesture = false  // Autoplay sounds
                    cacheMode = WebSettings.LOAD_DEFAULT      // Enable default caching
                    useWideViewPort = true
                    loadWithOverviewMode = true
                    
                    // Allow cross-origin requests from file/local URLs
                    allowFileAccessFromFileURLs = true
                    allowUniversalAccessFromFileURLs = true
                    
                    // Disable zoom controls to save layout pass and gestures overhead
                    builtInZoomControls = false
                    displayZoomControls = false
                    
                    // Use LAYER_TYPE_NONE so WebView draws directly to the window's GPU surface,
                    // which is much faster and smoother on modern Android devices than off-screen hardware layers.
                    wv.setLayerType(View.LAYER_TYPE_NONE, null)
                }

                // WebChromeClient to track permissions requested by JS code
                wv.webChromeClient = object : WebChromeClient() {
                    override fun onPermissionRequest(request: android.webkit.PermissionRequest?) {
                        try {
                            Log.d("FLIGHT_OF_LEGENDS_STARTUP", "WebView request permission for resources: ${request?.resources?.joinToString()}")
                            request?.grant(request.resources)
                        } catch (e: Exception) {
                            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to handle permission request in WebChromeClient", e)
                        }
                    }
                }
                
                // Intercept all requests under https://localapp/ to serve assets locally.
                wv.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): Boolean {
                        val url = request?.url?.toString() ?: return false
                        if (url.startsWith("mailto:")) {
                            try {
                                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse(url))
                                startActivity(intent)
                                return true
                            } catch (e: Exception) {
                                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to resolve mailto intent", e)
                            }
                        } else if (url.contains("play.google.com") || url.startsWith("market://")) {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                startActivity(intent)
                                return true
                            } catch (e: Exception) {
                                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to resolve playstore intent", e)
                            }
                        }
                        return super.shouldOverrideUrlLoading(view, request)
                    }

                    override fun shouldInterceptRequest(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): WebResourceResponse? {
                        val url = request?.url ?: return null
                        
                        // Intercept and serve locally
                        if (url.host == "localapp") {
                            val path = url.path ?: return null
                            try {
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
                            } catch (e: Exception) {
                                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Local asset fetch failure for path: $path", e)
                            }
                        }
                        return super.shouldInterceptRequest(view, request)
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onReceivedError(
                        view: WebView?,
                        errorCode: Int,
                        description: String?,
                        failingUrl: String?
                    ) {
                        Log.e("FLIGHT_OF_LEGENDS_STARTUP", "WebView Client Error [$errorCode]: $description (Failing URL: $failingUrl)")
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: android.webkit.WebResourceError?
                    ) {
                        val description = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                            error?.description?.toString()
                        } else {
                            "Unknown resource error"
                        }
                        val url = request?.url?.toString()
                        Log.e("FLIGHT_OF_LEGENDS_STARTUP", "WebView Resource Error: $description (URL: $url)")
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        val isOnline = isNetworkAvailable()
                        Log.d("FLIGHT_OF_LEGENDS_STARTUP", "onPageFinished: Initial online status: $isOnline")
                        webView.evaluateJavascript("javascript:if(window.setOnlineStatus) window.setOnlineStatus($isOnline);", null)
                    }
                }

                // Register Javascript interfaces
                wv.addJavascriptInterface(AdMobInterface(), "AndroidAdMob")
                wv.addJavascriptInterface(AndroidBridgeInterface(), "AndroidBridge")

                // Load local app entrypoint
                wv.loadUrl("https://localapp/index.html")
            }

            // Configure rootLayout programmatically to host both WebView and Banner Ad
            rootLayout = FrameLayout(this).apply {
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
            }
            rootLayout.addView(webView)
            setContentView(rootLayout)

        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "FATAL error setting up Layout/WebView UI components", e)
        }

        // 4. Safe Ads Initialization & Online/Offline check
        try {
            if (isNetworkAvailable()) {
                initializeAdsSDKsAndLoad()
            } else {
                Log.w("FLIGHT_OF_LEGENDS_STARTUP", "Launch detected offline. Bypassing Ads SDKs initialization. Game runs in offline mode.")
            }
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed during startup connectivity gating checks", e)
        }

        // 5. Register Connectivity Manager callback for dynamic online transition
        try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val networkRequest = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            connectivityManager.registerNetworkCallback(networkRequest, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    super.onAvailable(network)
                    runOnUiThread {
                        onNetworkConnected()
                        webView.evaluateJavascript("javascript:if(window.setOnlineStatus) window.setOnlineStatus(true);", null)
                    }
                }
                override fun onLost(network: Network) {
                    super.onLost(network)
                    runOnUiThread {
                        Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Network Callback: Network is offline.")
                        webView.evaluateJavascript("javascript:if(window.setOnlineStatus) window.setOnlineStatus(false);", null)
                    }
                }
            })
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to register network callback listener", e)
        }
    }

    private fun verifyPermissions() {
        try {
            val permissions = arrayOf(
                android.Manifest.permission.INTERNET,
                android.Manifest.permission.ACCESS_NETWORK_STATE
            )
            for (permission in permissions) {
                val granted = ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
                Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Permission check - $permission: ${if (granted) "GRANTED" else "DENIED"}")
            }
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to verify system permissions programmatically", e)
        }
    }

    private fun isNetworkAvailable(): Boolean {
        try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val activeNetwork = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
            val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Connection detected: ${if (hasInternet) "ONLINE" else "OFFLINE"}")
            return hasInternet
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to verify connection status safely", e)
            return false
        }
    }

    private fun initializeAdsSDKsAndLoad() {
        try {
            Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Initializing Mobile Ads & Unity Ads SDKs...")

            // Initialize Mobile Ads SDK
            MobileAds.initialize(this) { status ->
                Log.d("FLIGHT_OF_LEGENDS_STARTUP", "AdMob initialized. Status: $status")
            }

            // Initialize Unity Ads SDK
            UnityAds.initialize(this, unityGameId, false, object : IUnityAdsInitializationListener {
                override fun onInitializationComplete() {
                    Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Unity Ads SDK initialized successfully.")
                    isUnityAdsInitialized = true
                    loadUnityRewardedAd()
                    loadUnityInterstitialAd()
                }

                override fun onInitializationFailed(error: UnityAdsInitializationError?, message: String?) {
                    Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Unity Ads SDK initialization failed: $message (Error: $error)")
                    isUnityAdsInitialized = false
                }
            })

            // Preload AdMob ads
            loadInterstitialAd()
            loadRewardedAd()
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to initialize Ad SDKs or trigger preloads", e)
        }
    }

    private fun onNetworkConnected() {
        try {
            Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Network Callback: Network is online. Preloading ad assets.")
            // Reset retry counters
            interstitialRetryCount = 0
            rewardedRetryCount = 0
            unityRewardedRetryCount = 0
            unityInterstitialRetryCount = 0

            if (!isUnityAdsInitialized) {
                initializeAdsSDKsAndLoad()
            } else {
                loadUnityRewardedAd()
                loadUnityInterstitialAd()
                loadInterstitialAd()
                loadRewardedAd()
            }
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Failed to process onNetworkConnected transitions", e)
        }
    }

    override fun onBackPressed() {
        try {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                super.onBackPressed()
            }
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in onBackPressed()", e)
            super.onBackPressed()
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            webView.onPause()
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in onPause()", e)
        }
    }

    override fun onResume() {
        super.onResume()
        try {
            webView.onResume()
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in onResume()", e)
        }
    }

    override fun onDestroy() {
        try {
            webView.destroy()
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in onDestroy()", e)
        }
        super.onDestroy()
    }

    fun loadInterstitialAd() {
        try {
            if (rewardedInterstitialAd != null || isInterstitialLoading) return
            isInterstitialLoading = true

            val adRequest = AdRequest.Builder().build()
            RewardedInterstitialAd.load(
                this,
                "ca-app-pub-7590043194932862/9278780713", // Real Rewarded Interstitial ID (flappy1)
                adRequest,
                object : RewardedInterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedInterstitialAd) {
                        rewardedInterstitialAd = ad
                        isInterstitialLoading = false
                        interstitialRetryCount = 0
                        Log.d("FLIGHT_OF_LEGENDS_STARTUP", "AdMob Rewarded Interstitial Ad loaded successfully.")
                    }
                    override fun onAdFailedToLoad(error: LoadAdError) {
                        rewardedInterstitialAd = null
                        isInterstitialLoading = false
                        interstitialRetryCount++
                        Log.e("FLIGHT_OF_LEGENDS_STARTUP", "AdMob Rewarded Interstitial failed to load: $error. Retry count: $interstitialRetryCount")
                        // Background retry using exponential backoff (e.g. 5s, 10s, 15s... max 60s)
                        val delay = Math.min(60, 5 * interstitialRetryCount) * 1000L
                        webView.postDelayed({
                            loadInterstitialAd()
                        }, delay)
                    }
                }
            )
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in loadInterstitialAd()", e)
            isInterstitialLoading = false
        }
    }

    fun showInterstitialAd(callbackName: String? = null) {
        try {
            val ad = rewardedInterstitialAd
            if (ad != null) {
                ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                    override fun onAdDismissedFullScreenContent() {
                        rewardedInterstitialAd = null
                        loadInterstitialAd()
                        callbackName?.let { webView.evaluateJavascript("javascript:$it(true)", null) }
                    }
                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                        Log.e("FLIGHT_OF_LEGENDS_STARTUP", "AdMob Rewarded Interstitial failed to show: ${error.message}")
                        rewardedInterstitialAd = null
                        loadInterstitialAd()
                        callbackName?.let { webView.evaluateJavascript("javascript:$it(false)", null) }
                    }
                }
                ad.show(this) { rewardItem ->
                    Log.d("FLIGHT_OF_LEGENDS_STARTUP", "User earned reward from Rewarded Interstitial: ${rewardItem.amount}")
                }
            } else {
                Log.w("FLIGHT_OF_LEGENDS_STARTUP", "Rewarded Interstitial Ad requested but not loaded. Reloading...")
                loadInterstitialAd()
                callbackName?.let { webView.evaluateJavascript("javascript:$it(false)", null) }
            }
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in showInterstitialAd()", e)
            callbackName?.let { webView.evaluateJavascript("javascript:$it(false)", null) }
        }
    }

    fun loadRewardedAd() {
        try {
            if (rewardedAd != null || isRewardedLoading) return
            isRewardedLoading = true

            val adRequest = AdRequest.Builder().build()
            RewardedAd.load(
                this,
                "ca-app-pub-7590043194932862/4368023368", // Real Rewarded ID (flappy1)
                adRequest,
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) {
                        rewardedAd = ad
                        isRewardedLoading = false
                        rewardedRetryCount = 0
                        Log.d("FLIGHT_OF_LEGENDS_STARTUP", "AdMob Rewarded Ad loaded successfully.")
                    }
                    override fun onAdFailedToLoad(error: LoadAdError) {
                        rewardedAd = null
                        isRewardedLoading = false
                        rewardedRetryCount++
                        Log.e("FLIGHT_OF_LEGENDS_STARTUP", "AdMob Rewarded failed to load: $error. Retry count: $rewardedRetryCount")
                        // Background retry using exponential backoff
                        val delay = Math.min(60, 5 * rewardedRetryCount) * 1000L
                        webView.postDelayed({
                            loadRewardedAd()
                        }, delay)
                    }
                }
            )
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in loadRewardedAd()", e)
            isRewardedLoading = false
        }
    }

    fun showRewardedAd(callbackName: String) {
        try {
            val ad = rewardedAd
            if (ad != null) {
                ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                    override fun onAdDismissedFullScreenContent() {
                        rewardedAd = null
                        loadRewardedAd()
                    }
                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                        Log.e("FLIGHT_OF_LEGENDS_STARTUP", "AdMob Rewarded failed to show: ${error.message}")
                        rewardedAd = null
                        loadRewardedAd()
                        webView.evaluateJavascript("javascript:$callbackName(false)", null)
                    }
                }
                ad.show(this) {
                    // User earned the reward!
                    Log.d("FLIGHT_OF_LEGENDS_STARTUP", "AdMob Rewarded Ad completed. Granting reward.")
                    webView.evaluateJavascript("javascript:$callbackName(true)", null)
                }
            } else {
                Log.w("FLIGHT_OF_LEGENDS_STARTUP", "Rewarded Ad requested but not loaded. Reloading...")
                loadRewardedAd()
                webView.evaluateJavascript("javascript:$callbackName(false)", null)
            }
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in showRewardedAd()", e)
            webView.evaluateJavascript("javascript:$callbackName(false)", null)
        }
    }

    // --- Unity Ads implementation methods ---
    fun loadUnityRewardedAd() {
        try {
            if (!isUnityAdsInitialized || isUnityRewardedLoaded || isUnityRewardedLoading) return
            isUnityRewardedLoading = true

            UnityAds.load(unityRewardedPlacement, object : IUnityAdsLoadListener {
                override fun onUnityAdsAdLoaded(placementId: String?) {
                    Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Unity Rewarded Ad loaded successfully.")
                    isUnityRewardedLoaded = true
                    isUnityRewardedLoading = false
                    unityRewardedRetryCount = 0
                }

                override fun onUnityAdsFailedToLoad(placementId: String?, error: UnityAdsLoadError?, message: String?) {
                    isUnityRewardedLoaded = false
                    isUnityRewardedLoading = false
                    unityRewardedRetryCount++
                    Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Unity Rewarded Ad failed to load: $message (Error: $error). Retry: $unityRewardedRetryCount")
                    // Background retry using exponential backoff
                    val delay = Math.min(60, 5 * unityRewardedRetryCount) * 1000L
                    webView.postDelayed({
                        loadUnityRewardedAd()
                    }, delay)
                }
            })
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in loadUnityRewardedAd()", e)
            isUnityRewardedLoading = false
        }
    }

    fun showUnityRewardedAd(callbackName: String) {
        try {
            if (isUnityRewardedLoaded) {
                UnityAds.show(this, unityRewardedPlacement, UnityAdsShowOptions(), object : IUnityAdsShowListener {
                    override fun onUnityAdsShowFailure(placementId: String?, error: UnityAdsShowError?, message: String?) {
                        Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Unity Rewarded Ad show failed: $message (Error: $error)")
                        isUnityRewardedLoaded = false
                        loadUnityRewardedAd()
                        webView.evaluateJavascript("javascript:$callbackName(false)", null)
                    }

                    override fun onUnityAdsShowStart(placementId: String?) {
                        Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Unity Rewarded Ad showing started.")
                    }

                    override fun onUnityAdsShowClick(placementId: String?) {}

                    override fun onUnityAdsShowComplete(
                        placementId: String?,
                        state: UnityAds.UnityAdsShowCompletionState?
                    ) {
                        isUnityRewardedLoaded = false
                        loadUnityRewardedAd()
                        if (state == UnityAds.UnityAdsShowCompletionState.COMPLETED) {
                            Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Unity Rewarded Ad finished successfully. Granting reward.")
                            webView.evaluateJavascript("javascript:$callbackName(true)", null)
                        } else {
                            Log.w("FLIGHT_OF_LEGENDS_STARTUP", "Unity Rewarded Ad finished with state: $state")
                            webView.evaluateJavascript("javascript:$callbackName(false)", null)
                        }
                    }
                })
            } else {
                Log.w("FLIGHT_OF_LEGENDS_STARTUP", "Unity Rewarded Ad requested but not loaded. Reloading...")
                loadUnityRewardedAd()
                webView.evaluateJavascript("javascript:$callbackName(false)", null)
            }
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in showUnityRewardedAd()", e)
            webView.evaluateJavascript("javascript:$callbackName(false)", null)
        }
    }

    fun loadUnityInterstitialAd() {
        try {
            if (!isUnityAdsInitialized || isUnityInterstitialLoaded || isUnityInterstitialLoading) return
            isUnityInterstitialLoading = true

            UnityAds.load(unityInterstitialPlacement, object : IUnityAdsLoadListener {
                override fun onUnityAdsAdLoaded(placementId: String?) {
                    Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Unity Interstitial Ad loaded successfully.")
                    isUnityInterstitialLoaded = true
                    isUnityInterstitialLoading = false
                    unityInterstitialRetryCount = 0
                }

                override fun onUnityAdsFailedToLoad(placementId: String?, error: UnityAdsLoadError?, message: String?) {
                    isUnityInterstitialLoaded = false
                    isUnityInterstitialLoading = false
                    unityInterstitialRetryCount++
                    Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Unity Interstitial Ad failed to load: $message (Error: $error). Retry: $unityInterstitialRetryCount")
                    // Background retry using exponential backoff
                    val delay = Math.min(60, 5 * unityInterstitialRetryCount) * 1000L
                    webView.postDelayed({
                        loadUnityInterstitialAd()
                    }, delay)
                }
            })
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in loadUnityInterstitialAd()", e)
            isUnityInterstitialLoading = false
        }
    }

    fun showUnityInterstitialAd(callbackName: String? = null) {
        try {
            if (isUnityInterstitialLoaded) {
                UnityAds.show(this, unityInterstitialPlacement, UnityAdsShowOptions(), object : IUnityAdsShowListener {
                    override fun onUnityAdsShowFailure(placementId: String?, error: UnityAdsShowError?, message: String?) {
                        Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Unity Interstitial show failed: $message (Error: $error)")
                        isUnityInterstitialLoaded = false
                        loadUnityInterstitialAd()
                        callbackName?.let { webView.evaluateJavascript("javascript:$it(false)", null) }
                    }

                    override fun onUnityAdsShowStart(placementId: String?) {
                        Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Unity Interstitial Ad showing started.")
                    }

                    override fun onUnityAdsShowClick(placementId: String?) {}

                    override fun onUnityAdsShowComplete(
                        placementId: String?,
                        state: UnityAds.UnityAdsShowCompletionState?
                    ) {
                        isUnityInterstitialLoaded = false
                        loadUnityInterstitialAd()
                        Log.d("FLIGHT_OF_LEGENDS_STARTUP", "Unity Interstitial Ad completed. State: $state")
                        callbackName?.let { webView.evaluateJavascript("javascript:$it(true)", null) }
                    }
                })
            } else {
                Log.w("FLIGHT_OF_LEGENDS_STARTUP", "Unity Interstitial Ad requested but not loaded. Reloading...")
                loadUnityInterstitialAd()
                callbackName?.let { webView.evaluateJavascript("javascript:$it(false)", null) }
            }
        } catch (e: Exception) {
            Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in showUnityInterstitialAd()", e)
            callbackName?.let { webView.evaluateJavascript("javascript:$it(false)", null) }
        }
    }

    // --- Javascript Interfaces ---
    inner class AdMobInterface {
        @JavascriptInterface
        fun showInterstitial() {
            try {
                runOnUiThread { showInterstitialAd() }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AdMobInterface.showInterstitial()", e)
            }
        }

        @JavascriptInterface
        fun showRewarded(callbackName: String) {
            try {
                runOnUiThread { showRewardedAd(callbackName) }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AdMobInterface.showRewarded()", e)
            }
        }
    }

    inner class AndroidBridgeInterface {
        @JavascriptInterface
        fun showAdMobInterstitial() {
            try {
                runOnUiThread { showInterstitialAd(null) }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AndroidBridgeInterface.showAdMobInterstitial()", e)
            }
        }

        @JavascriptInterface
        fun showAdMobInterstitial(callbackName: String) {
            try {
                runOnUiThread { showInterstitialAd(callbackName) }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AndroidBridgeInterface.showAdMobInterstitial(callbackName)", e)
            }
        }

        @JavascriptInterface
        fun showUnityInterstitial() {
            try {
                runOnUiThread { showUnityInterstitialAd(null) }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AndroidBridgeInterface.showUnityInterstitial()", e)
            }
        }

        @JavascriptInterface
        fun showUnityInterstitial(callbackName: String) {
            try {
                runOnUiThread { showUnityInterstitialAd(callbackName) }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AndroidBridgeInterface.showUnityInterstitial(callbackName)", e)
            }
        }

        @JavascriptInterface
        fun showAdMobRewarded(callbackName: String) {
            try {
                runOnUiThread { showRewardedAd(callbackName) }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AndroidBridgeInterface.showAdMobRewarded()", e)
            }
        }

        @JavascriptInterface
        fun showUnityRewarded(callbackName: String) {
            try {
                runOnUiThread { showUnityRewardedAd(callbackName) }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AndroidBridgeInterface.showUnityRewarded()", e)
            }
        }

        @JavascriptInterface
        fun preloadAds() {
            try {
                runOnUiThread {
                    Log.d("FLIGHT_OF_LEGENDS_STARTUP", "JavaScript triggered preloadAds.")
                    onNetworkConnected()
                }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AndroidBridgeInterface.preloadAds()", e)
            }
        }

        @JavascriptInterface
        fun isAdReady(adType: String): Boolean {
            val ready = when (adType) {
                "AdMobInterstitial" -> rewardedInterstitialAd != null
                "UnityInterstitial" -> isUnityInterstitialLoaded
                "AdMobRewarded" -> rewardedAd != null
                "UnityRewarded" -> isUnityRewardedLoaded
                else -> false
            }
            Log.d("FLIGHT_OF_LEGENDS_STARTUP", "isAdReady($adType): $ready")
            return ready
        }

        @JavascriptInterface
        fun shareText(text: String) {
            try {
                runOnUiThread {
                    val sendIntent = Intent().apply {
                        action = Intent.ACTION_SEND
                        putExtra(Intent.EXTRA_TEXT, text)
                        type = "text/plain"
                    }
                    val shareIntent = Intent.createChooser(sendIntent, "Share via")
                    startActivity(shareIntent)
                }
            } catch (e: Exception) {
                Log.e("FLIGHT_OF_LEGENDS_STARTUP", "Exception in AndroidBridgeInterface.shareText()", e)
            }
        }
    }
}
