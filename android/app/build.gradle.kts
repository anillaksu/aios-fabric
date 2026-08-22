plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
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
        compose = true
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

// Bundles the ONE canonical catalog file (produced by
// desktop/build-artifact-catalog.mjs from real aapt2/apksigner metadata) as an
// APK asset, so the Artifact Store reads the same catalog everyone else does
// instead of a hand-duplicated copy.
val syncCatalogAsset = tasks.register<Copy>("syncCatalogAsset") {
    from(rootProject.file("../artifacts-catalog/com.aios.nodeagent.json"))
    into(layout.projectDirectory.dir("src/main/assets"))
    rename { "catalog.json" }
}
tasks.matching { it.name.startsWith("merge") && it.name.contains("Assets") }.configureEach {
    dependsOn(syncCatalogAsset)
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.runtime:runtime")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material:material-icons-core")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
