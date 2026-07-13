package app.clipd

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import app.clipd.ui.HomeScreen
import app.clipd.ui.OnboardingScreen
import app.clipd.ui.SettingsScreen
import app.clipd.ui.theme.ClipdTheme

enum class Screen { Onboarding, Home, Settings }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ClipdTheme { App() } }
    }
}

@Composable
private fun App() {
    val ctx = LocalContext.current
    val store = remember { SecureStore(ctx) }
    var screen by remember {
        mutableStateOf(if (store.isConfigured()) Screen.Home else Screen.Onboarding)
    }

    val notifPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* résultat ignoré : la sync marche sans, juste pas de notif */ }

    fun ensureNotifPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    // Démarre le service de réception si déjà configuré.
    LaunchedEffect(screen) {
        if (screen == Screen.Home && store.isConfigured()) {
            ensureNotifPermission()
            RealtimeService.start(ctx)
        }
    }

    when (screen) {
        Screen.Onboarding -> OnboardingScreen(store) {
            screen = Screen.Home
        }
        Screen.Home -> HomeScreen(store, onSettings = { screen = Screen.Settings })
        Screen.Settings -> SettingsScreen(
            store,
            onBack = { screen = Screen.Home },
            onUnpair = {
                RealtimeService.stop(ctx)
                store.clear()
                screen = Screen.Onboarding
            },
        )
    }
}
