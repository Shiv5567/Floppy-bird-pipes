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
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
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
    private var adView: AdView? = null
    private var interstitialAd: InterstitialAd? = null
    private var rewardedAd: RewardedAd? = null

    // Unity Ads state
    private val unityGameId = "5320875" // Test Game ID
    private val unityRewardedPlacement = "Rewarded_Android" // Default rewarded placement
    private val unityInterstitialPlacement = "Interstitial_Android" // Default interstitial placement
    private var isUnityAdsInitialized = false
    private var isUnityRewardedLoaded = false
    private var isUnityInterstitialLoaded = false

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

            // Register Javascript interface for legacy AdMob communication
            wv.addJavascriptInterface(AdMobInterface(), "AndroidAdMob")
            // Register Javascript interface for unified AndroidBridge communication
            wv.addJavascriptInterface(AndroidBridgeInterface(), "AndroidBridge")

            // Load the index page over a secure local domain.
            // This treats the app as standard HTTPS, enabling full ES Module loading.
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

        // Initialize Mobile Ads SDK
        MobileAds.initialize(this) {}

        // Initialize Unity Ads SDK
        UnityAds.initialize(this, unityGameId, true, object : IUnityAdsInitializationListener {
            override fun onInitializationComplete() {
                isUnityAdsInitialized = true
                loadUnityRewardedAd()
                loadUnityInterstitialAd()
            }

            override fun onInitializationFailed(error: UnityAdsInitializationError?, message: String?) {
                isUnityAdsInitialized = false
            }
        })

        // Preload Interstitial and Rewarded ads
        loadInterstitialAd()
        loadRewardedAd()
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
        adView?.destroy()
        webView.destroy()
        super.onDestroy()
    }

    fun showBannerAd() {
        if (adView != null) return // Already showing
        
        val banner = AdView(this).apply {
            adUnitId = "ca-app-pub-3940256099942544/6300978111" // Test Banner ID
            setAdSize(AdSize.BANNER)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = android.view.Gravity.BOTTOM or android.view.Gravity.CENTER_HORIZONTAL
            }
        }
        
        adView = banner
        rootLayout.addView(banner)
        
        val adRequest = AdRequest.Builder().build()
        banner.loadAd(adRequest)
    }

    fun hideBannerAd() {
        adView?.let { banner ->
            rootLayout.removeView(banner)
            banner.destroy()
            adView = null
        }
    }

    fun loadInterstitialAd() {
        val adRequest = AdRequest.Builder().build()
        InterstitialAd.load(
            this,
            "ca-app-pub-3940256099942544/1033173712", // Test Interstitial ID
            adRequest,
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    interstitialAd = ad
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    interstitialAd = null
                }
            }
        )
    }

    fun showInterstitialAd() {
        val ad = interstitialAd
        if (ad != null) {
            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    interstitialAd = null
                    loadInterstitialAd()
                }
                override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                    interstitialAd = null
                    loadInterstitialAd()
                }
            }
            ad.show(this)
        } else {
            loadInterstitialAd()
        }
    }

    fun loadRewardedAd() {
        val adRequest = AdRequest.Builder().build()
        RewardedAd.load(
            this,
            "ca-app-pub-3940256099942544/5224354917", // Test Rewarded ID
            adRequest,
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    rewardedAd = ad
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    rewardedAd = null
                }
            }
        )
    }

    fun showRewardedAd(callbackName: String) {
        val ad = rewardedAd
        if (ad != null) {
            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    rewardedAd = null
                    loadRewardedAd()
                }
                override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                    rewardedAd = null
                    loadRewardedAd()
                    webView.evaluateJavascript("javascript:$callbackName(false)", null)
                }
            }
            ad.show(this) {
                // User earned the reward!
                webView.evaluateJavascript("javascript:$callbackName(true)", null)
            }
        } else {
            loadRewardedAd()
            webView.evaluateJavascript("javascript:$callbackName(false)", null)
        }
    }

    // --- Unity Ads implementation methods ---
    fun loadUnityRewardedAd() {
        if (!isUnityAdsInitialized) return
        UnityAds.load(unityRewardedPlacement, object : IUnityAdsLoadListener {
            override fun onUnityAdsAdLoaded(placementId: String?) {
                isUnityRewardedLoaded = true
            }

            override fun onUnityAdsFailedToLoad(placementId: String?, error: UnityAdsLoadError?, message: String?) {
                isUnityRewardedLoaded = false
            }
        })
    }

    fun showUnityRewardedAd(callbackName: String) {
        if (isUnityRewardedLoaded) {
            UnityAds.show(this, unityRewardedPlacement, UnityAdsShowOptions(), object : IUnityAdsShowListener {
                override fun onUnityAdsShowFailure(placementId: String?, error: UnityAdsShowError?, message: String?) {
                    isUnityRewardedLoaded = false
                    loadUnityRewardedAd()
                    webView.evaluateJavascript("javascript:$callbackName(false)", null)
                }

                override fun onUnityAdsShowStart(placementId: String?) {}

                override fun onUnityAdsShowClick(placementId: String?) {}

                 override fun onUnityAdsShowComplete(
                    placementId: String?,
                    state: UnityAds.UnityAdsShowCompletionState?
                ) {
                    isUnityRewardedLoaded = false
                    loadUnityRewardedAd()
                    if (state == UnityAds.UnityAdsShowCompletionState.COMPLETED) {
                        webView.evaluateJavascript("javascript:$callbackName(true)", null)
                    } else {
                        webView.evaluateJavascript("javascript:$callbackName(false)", null)
                    }
                }
            })
        } else {
            loadUnityRewardedAd()
            webView.evaluateJavascript("javascript:$callbackName(false)", null)
        }
    }

    fun loadUnityInterstitialAd() {
        if (!isUnityAdsInitialized) return
        UnityAds.load(unityInterstitialPlacement, object : IUnityAdsLoadListener {
            override fun onUnityAdsAdLoaded(placementId: String?) {
                isUnityInterstitialLoaded = true
            }

            override fun onUnityAdsFailedToLoad(placementId: String?, error: UnityAdsLoadError?, message: String?) {
                isUnityInterstitialLoaded = false
            }
        })
    }

    fun showUnityInterstitialAd() {
        if (isUnityInterstitialLoaded) {
            UnityAds.show(this, unityInterstitialPlacement, UnityAdsShowOptions(), object : IUnityAdsShowListener {
                override fun onUnityAdsShowFailure(placementId: String?, error: UnityAdsShowError?, message: String?) {
                    isUnityInterstitialLoaded = false
                    loadUnityInterstitialAd()
                }

                override fun onUnityAdsShowStart(placementId: String?) {}

                override fun onUnityAdsShowClick(placementId: String?) {}

                override fun onUnityAdsShowComplete(
                    placementId: String?,
                    state: UnityAds.UnityAdsShowCompletionState?
                ) {
                    isUnityInterstitialLoaded = false
                    loadUnityInterstitialAd()
                }
            })
        } else {
            loadUnityInterstitialAd()
        }
    }

    // --- Javascript Interfaces ---
    inner class AdMobInterface {
        @JavascriptInterface
        fun showBanner() {
            runOnUiThread { showBannerAd() }
        }

        @JavascriptInterface
        fun hideBanner() {
            runOnUiThread { hideBannerAd() }
        }

        @JavascriptInterface
        fun showInterstitial() {
            runOnUiThread { showInterstitialAd() }
        }

        @JavascriptInterface
        fun showRewarded(callbackName: String) {
            runOnUiThread { showRewardedAd(callbackName) }
        }
    }

    inner class AndroidBridgeInterface {
        @JavascriptInterface
        fun showAdMobInterstitial() {
            runOnUiThread { showInterstitialAd() }
        }

        @JavascriptInterface
        fun showUnityInterstitial() {
            runOnUiThread { showUnityInterstitialAd() }
        }

        @JavascriptInterface
        fun showAdMobRewarded(callbackName: String) {
            runOnUiThread { showRewardedAd(callbackName) }
        }

        @JavascriptInterface
        fun showUnityRewarded(callbackName: String) {
            runOnUiThread { showUnityRewardedAd(callbackName) }
        }
    }
}
