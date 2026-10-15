plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "dev.zamok.vault"
    compileSdk = 36

    // The debug key is pinned to a file in the project when one is there, instead of AGP's default
    // under the user's home directory. CI caches exactly this one file, and a stable key is what
    // lets a new build install over the previous one: Android refuses a differently signed
    // package, and the only way through is to uninstall — which, with system backup off, takes the
    // vault with it. No file (a fresh clone) simply falls back to AGP's own key.
    signingConfigs {
        val pinned = rootProject.file("debug.keystore")
        if (pinned.exists()) {
            getByName("debug") {
                storeFile = pinned
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    defaultConfig {
        applicationId = "dev.zamok.vault"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    // Versions come from the BOM, so nothing here is hand-picked.
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.runtime)
    implementation(libs.androidx.compose.material3)
    // Not pulled in by material3, but it is what the BOM pins the icons to, and the screen needs
    // them: no hand-drawn glyphs, and no emoji, whose look changes from phone to phone.
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
}
