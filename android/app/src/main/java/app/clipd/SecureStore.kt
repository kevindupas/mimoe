package app.clipd

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

/**
 * Config + secrets dans des EncryptedSharedPreferences (chiffrées par une clé
 * maître de l'Android Keystore). La clé E2E dérivée n'est jamais en clair sur disque.
 * Sert aussi de stockage local de l'historique (textes déjà déchiffrés).
 */
class SecureStore(context: Context) {

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "clipd_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var serverUrl: String
        get() = prefs.getString("server_url", "") ?: ""
        set(v) = prefs.edit().putString("server_url", v).apply()

    var deviceId: String
        get() = prefs.getString("device_id", "") ?: ""
        set(v) = prefs.edit().putString("device_id", v).apply()

    var deviceToken: String
        get() = prefs.getString("device_token", "") ?: ""
        set(v) = prefs.edit().putString("device_token", v).apply()

    var reverbAppKey: String
        get() = prefs.getString("reverb_app_key", "") ?: ""
        set(v) = prefs.edit().putString("reverb_app_key", v).apply()

    var reverbPort: Int
        get() = prefs.getInt("reverb_port", 8080)
        set(v) = prefs.edit().putInt("reverb_port", v).apply()

    /** Hôte Reverb = même hôte que le serveur (on ne fait pas confiance à un "localhost" renvoyé). */
    val reverbHost: String get() = Uri.parse(serverUrl).host ?: ""
    val reverbScheme: String get() = if (serverUrl.startsWith("https")) "https" else "http"

    fun saveKey(key: ByteArray) {
        prefs.edit().putString("enc_key", Base64.encodeToString(key, Base64.NO_WRAP)).apply()
    }

    fun getKey(): ByteArray? {
        val b64 = prefs.getString("enc_key", null) ?: return null
        return Base64.decode(b64, Base64.NO_WRAP)
    }

    fun isConfigured(): Boolean =
        serverUrl.isNotEmpty() && deviceId.isNotEmpty() && deviceToken.isNotEmpty() && getKey() != null

    fun clear() = prefs.edit().clear().apply()

    // --- Historique local (textes déjà déchiffrés, protégés par le Keystore) ---
    private val MAX = 100

    fun loadHistory(): List<Clip> {
        val raw = prefs.getString("history", null) ?: return emptyList()
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Clip(
                id = o.getString("id"),
                originDeviceId = o.getString("origin"),
                text = o.getString("text"),
                isSensitive = o.optBoolean("sensitive", false),
                createdAt = o.getString("created"),
                mine = o.optBoolean("mine", false),
            )
        }
    }

    fun saveHistory(clips: List<Clip>) {
        val arr = JSONArray()
        clips.take(MAX).forEach { c ->
            arr.put(JSONObject().apply {
                put("id", c.id); put("origin", c.originDeviceId); put("text", c.text)
                put("sensitive", c.isSensitive); put("created", c.createdAt); put("mine", c.mine)
            })
        }
        prefs.edit().putString("history", arr.toString()).apply()
    }

    fun addClip(clip: Clip): List<Clip> {
        val cur = loadHistory().toMutableList()
        if (cur.any { it.id == clip.id }) return cur
        cur.add(0, clip)
        val trimmed = cur.take(MAX)
        saveHistory(trimmed)
        return trimmed
    }
}
