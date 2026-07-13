package app.clipd.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.clipd.ClipApi
import app.clipd.Crypto
import app.clipd.SecureStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

@Composable
fun OnboardingScreen(store: SecureStore, onDone: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    var server by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passphrase by remember { mutableStateOf("") }
    var register by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun finish() {
        busy = true; error = ""
        scope.launch {
            val res = withContext(Dispatchers.IO) {
                runCatching {
                    val url = server.trim().trimEnd('/')
                    val deviceId = UUID.randomUUID().toString()
                    val auth = ClipApi.auth(url, if (register) "register" else "login", email.trim(), password, deviceId)
                    val key = Crypto.deriveKey(passphrase)
                    store.serverUrl = url
                    store.deviceId = deviceId
                    store.deviceToken = auth.token
                    store.userId = auth.userId
                    store.reverbAppKey = auth.reverbAppKey
                    store.reverbPort = auth.reverbPort
                    store.saveKey(key)
                }
            }
            busy = false
            res.fold({ onDone() }, { error = "Échec : ${it.message}" })
        }
    }

    fun next() {
        error = ""
        when (step) {
            1 -> if (server.isBlank()) error = "Renseigne le serveur." else step = 2
            2 -> if (email.isBlank() || password.isBlank()) error = "Email et mot de passe requis." else step = 3
            3 -> if (passphrase.isBlank()) error = "La passphrase est requise." else finish()
            else -> step = 1
        }
    }

    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (step > 0) {
                    IconButton(onClick = { error = ""; step-- }, Modifier.size(32.dp)) {
                        Icon(Icons.Outlined.ArrowBackIosNew, "Retour", Modifier.size(18.dp))
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(8.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
                        Spacer(Modifier.width(8.dp))
                        Text("Clipd", fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.weight(1f))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    repeat(4) { i ->
                        Box(
                            Modifier.height(7.dp).width(if (i == step) 20.dp else 7.dp)
                                .background(
                                    if (i <= step) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.outline,
                                    RoundedCornerShape(4.dp),
                                )
                        )
                    }
                }
                Spacer(Modifier.width(32.dp))
            }

            AnimatedContent(
                targetState = step,
                transitionSpec = {
                    val dir = if (targetState > initialState) 1 else -1
                    (slideInHorizontally { it * dir / 3 } + fadeIn(tween(250))) togetherWith
                        (slideOutHorizontally { -it * dir / 3 } + fadeOut(tween(180)))
                },
                label = "step",
                modifier = Modifier.weight(1f),
            ) { s ->
                StepBody(s, register, { register = !register },
                    server, { server = it }, email, { email = it },
                    password, { password = it }, passphrase, { passphrase = it }, error)
            }

            Box(Modifier.padding(24.dp)) {
                Button(
                    onClick = { next() },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text(
                        when {
                            step == 0 -> "Commencer"
                            step == 3 && busy -> "Connexion…"
                            step == 3 -> "Terminer"
                            else -> "Continuer"
                        },
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun StepBody(
    step: Int,
    register: Boolean, onToggle: () -> Unit,
    server: String, onServer: (String) -> Unit,
    email: String, onEmail: (String) -> Unit,
    password: String, onPassword: (String) -> Unit,
    passphrase: String, onPassphrase: (String) -> Unit,
    error: String,
) {
    val (icon, title, sub) = when (step) {
        0 -> Triple(Icons.Outlined.Devices, "Ton presse-papier, partout.",
            "Copie sur ton téléphone, colle sur ton ordi. Chiffré de bout en bout, sur ton propre serveur.")
        1 -> Triple(Icons.Outlined.Dns, "Ton serveur",
            "L'adresse de ton instance Clipd. Il ne voit jamais tes données en clair.")
        2 -> Triple(Icons.Outlined.PersonOutline,
            if (register) "Crée ton compte" else "Connecte-toi",
            "Ton compte relie tous tes appareils. Historique isolé, rien que le tien.")
        else -> Triple(Icons.Outlined.Lock, "La clé secrète",
            "Une passphrase que tu tapes sur chacun de tes appareils. Elle chiffre tout et ne quitte jamais ce téléphone.")
    }

    Column(
        Modifier.fillMaxSize().padding(horizontal = 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(110.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary) }

        Spacer(Modifier.height(24.dp))
        Text(title, style = MaterialTheme.typography.headlineLarge, textAlign = TextAlign.Center)
        Spacer(Modifier.height(10.dp))
        Text(sub, style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 320.dp))
        Spacer(Modifier.height(22.dp))

        when (step) {
            1 -> Field(server, onServer, "https://clipd.exemple.com", KeyboardType.Uri)
            2 -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field(email, onEmail, "Email", KeyboardType.Email)
                Field(password, onPassword, "Mot de passe", password = true)
                Row {
                    Text(if (register) "Déjà un compte ? " else "Pas de compte ? ",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(if (register) "Se connecter" else "Créer un compte",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { onToggle() })
                }
            }
            3 -> Field(passphrase, onPassphrase, "Passphrase partagée", password = true)
        }

        if (error.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Text(error, color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun Field(
    value: String, onChange: (String) -> Unit, hint: String,
    keyboard: KeyboardType = KeyboardType.Text, password: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text(hint) },
        singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboard),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth(),
    )
}
