package app.clipd.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.clipd.Clip
import app.clipd.ClipApi
import app.clipd.ClipBus
import app.clipd.Crypto
import app.clipd.SecureStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(store: SecureStore, onSettings: () -> Unit) {
    val ctx = LocalContext.current
    val clips by ClipBus.clips.collectAsState()
    val scope = rememberCoroutineScope()

    // Charge l'historique local puis synchronise avec le serveur.
    LaunchedEffect(Unit) {
        ClipBus.set(store.loadHistory())
        withContext(Dispatchers.IO) {
            val key = store.getKey() ?: return@withContext
            val raws = runCatching { ClipApi.fetchHistory(store.serverUrl, store.deviceToken) }.getOrNull().orEmpty()
            val decrypted = raws.mapNotNull { r ->
                runCatching {
                    Clip(r.id, r.originDeviceId, Crypto.decrypt(key, r.ciphertext, r.nonce),
                        r.isSensitive, r.createdAt, r.originDeviceId == store.deviceId)
                }.getOrNull()
            }
            if (decrypted.isNotEmpty()) {
                store.saveHistory(decrypted)
                ClipBus.set(decrypted)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(9.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
                        Spacer(Modifier.width(8.dp))
                        Text("Clipd", fontWeight = FontWeight.SemiBold)
                    }
                },
                actions = {
                    IconButton(onClick = onSettings) {
                        Icon(Icons.Outlined.Settings, "Réglages")
                    }
                },
            )
        },
    ) { pad ->
        if (clips.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Outlined.ContentPaste, null, Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.outline)
                    Spacer(Modifier.height(10.dp))
                    Text("Rien pour l'instant", color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Medium)
                    Text("Partage du texte → Clipd, ou copie sur un autre appareil.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.outline)
                }
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize().padding(pad),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(clips, key = { it.id }) { clip ->
                    ClipCard(clip) { copyToClipboard(ctx, clip.text) }
                }
            }
        }
    }
}

@Composable
private fun ClipCard(clip: Clip, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                clip.text.take(200), maxLines = 4,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(9.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (clip.mine) Icons.Outlined.Smartphone else Icons.Outlined.Laptop,
                    null, Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(5.dp))
                Text(if (clip.mine) "ce téléphone" else "reçu",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (clip.isSensitive) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier.clip(RoundedCornerShape(5.dp))
                            .background(MaterialTheme.colorScheme.error.copy(alpha = 0.12f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text("SENSIBLE", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error)
                    }
                }
                Spacer(Modifier.weight(1f))
                Text(relTime(clip.createdAt), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}

private fun copyToClipboard(ctx: Context, text: String) {
    val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("Clipd", text))
    Toast.makeText(ctx, "Copié", Toast.LENGTH_SHORT).show()
}

private fun relTime(iso: String): String = try {
    val t = java.time.Instant.parse(iso).toEpochMilli()
    val diff = (System.currentTimeMillis() - t).coerceAtLeast(0) / 1000
    when {
        diff < 60 -> "à l'instant"
        diff < 3600 -> "${diff / 60} min"
        diff < 86400 -> "${diff / 3600} h"
        else -> "${diff / 86400} j"
    }
} catch (e: Exception) { "" }
