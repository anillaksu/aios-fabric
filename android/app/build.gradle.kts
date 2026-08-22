plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.aios.nodeagent"
    compileSdk = 35

    // AIOS artifact-supply-chain generations are NOT modeled via Android
    // versionCode (bumping it would trigger Android's downgrade-protection
    // wall on rollback, which requires shell/root privileges a normal app
    // does not have). versionCode stays constant; artifact identity/content
    // differs via this marker, baked into BuildConfig so it's part of the
    // actual compiled bytes (and therefore the real sha256), not a label.
    val artifactBuildMarker = (project.findProperty("artifactBuildMarker") as String?) ?: "v1"

    defaultConfig {
        applicationId = "com.aios.nodeagent"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.2.0-supply-chain"
        buildConfigField("String", "ARTIFACT_BUILD_MARKER", "\"$artifactBuildMarker\"")
        ndk {
            abiFilters += "arm64-v8a"
        }
    }

    buildFeatures {
        buildConfig = true
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
