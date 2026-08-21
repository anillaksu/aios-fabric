plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.aios.nodeagent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.aios.nodeagent"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-design"
        ndk {
            abiFilters += "arm64-v8a"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
