package app.clipd

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import kotlin.concurrent.thread

/**
 * Cible du Share Sheet. Sans UI : recoit le texte, le chiffre, POST, toast, se ferme.
 * Respecte le flag sensible : un contenu marque IS_SENSITIVE est ignore.
 */
class ShareActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val store = SecureStore(this)
        if (!store.isConfigured()) {
            toastAndFinish("Clipd non configure — ouvre l'app d'abord.")
            return
        }

        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") {
            finish(); return
        }

        // Respect du flag sensible (best-effort : les gestionnaires de mots de passe le posent).
        if (isSensitive()) {
            toastAndFinish("Contenu sensible ignore.")
            return
        }

        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
        if (text.isNullOrEmpty()) {
            toastAndFinish("Rien a partager.")
            return
        }

        val key = store.getKey()
        if (key == null) {
            toastAndFinish("Cle manquante.")
            return
        }

        thread {
            val ok = try {
                val (ciphertext, nonce) = Crypto.encrypt(key, text)
                ClipApi.postClip(store.serverUrl, store.deviceToken, store.deviceId, ciphertext, nonce)
            } catch (e: Exception) {
                false
            }
            runOnUiThread {
                toastAndFinish(if (ok) "Envoye a Clipd" else "Echec de l'envoi")
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun isSensitive(): Boolean {
        // ClipDescription.EXTRA_IS_SENSITIVE (API 33+) ou l'extra brut sinon.
        val fromClip = intent.clipData?.description?.extras
            ?.getBoolean("android.content.extra.IS_SENSITIVE", false) ?: false
        val fromIntent = intent.getBooleanExtra("android.content.extra.IS_SENSITIVE", false)
        return fromClip || fromIntent
    }

    private fun toastAndFinish(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        finish()
    }
}
