plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.example.flightoflegends"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.advance.flappylegends"
        minSdk = 24
        targetSdk = 36
        versionCode = 10
        versionName = "1.2.6"
    }

    layout.buildDirectory.set(file("C:/Users/Admin/.gemini/antigravity-ide/scratch/build-app"))

    signingConfigs {
        create("release") {
            storeFile = file("${rootProject.projectDir}/flappy-legends-release.keystore")
            storePassword = "FlappyLegends2026"
            keyAlias = "flappy-legends"
            keyPassword = "FlappyLegends2026"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
      compose = false
      aidl = false
      buildConfig = false
      shaders = false
    }

    sourceSets {
        getByName("main") {
            assets.setSrcDirs(listOf(file("C:/Users/Admin/.gemini/antigravity-ide/scratch/assets")))
        }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
  // Core Android dependencies — WebView is included in Android SDK natively
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Google AdMob Ads SDK
  implementation("com.google.android.gms:play-services-ads:23.0.0")

  // Unity Ads SDK
  implementation("com.unity3d.ads:unity-ads:4.12.2")

  // Local tests
  testImplementation(libs.junit)

  // Instrumented tests
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)
}
