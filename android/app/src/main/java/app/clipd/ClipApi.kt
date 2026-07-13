package app.clipd

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

data class AuthResult(val token: String, val userId: Long, val reverbAppKey: String, val reverbPort: Int)
data class RawClip(
    val id: String, val originDeviceId: String, val ciphertext: String,
    val nonce: String, val isSensitive: Boolean, val createdAt: String,
)

/** Appels HTTP vers le serveur. Le contenu est chiffré en amont. */
object ClipApi {
    private val client = OkHttpClient()
    private val JSON = "application/json".toMediaType()

    fun postClip(
        serverUrl: String, token: String, deviceId: String,
        ciphertext: String, nonce: String, isSensitive: Boolean = false,
    ): Boolean {
        val body = JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("origin_device_id", deviceId)
            put("ciphertext", ciphertext)
            put("nonce", nonce)
            put("is_sensitive", isSensitive)
            put("created_at", iso8601Now())
        }.toString()
        val req = Request.Builder()
            .url("$serverUrl/api/clip")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .post(body.toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { return it.isSuccessful }
    }

    /** Inscription ou connexion. `path` = "register" | "login". Renvoie token + user + reverb. */
    fun auth(serverUrl: String, path: String, email: String, password: String, deviceId: String): AuthResult {
        val body = JSONObject().apply {
            put("email", email); put("password", password)
            put("device_id", deviceId); put("device_name", "Android"); put("platform", "android")
        }.toString()
        val req = Request.Builder()
            .url("$serverUrl/api/$path")
            .header("Accept", "application/json")
            .post(body.toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { resp ->
            val txt = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                val msg = runCatching { JSONObject(txt).optString("message") }.getOrNull()
                throw Exception(if (msg.isNullOrBlank()) "erreur ${resp.code}" else msg)
            }
            val o = JSONObject(txt)
            return AuthResult(
                o.getString("token"), o.getLong("user_id"),
                o.getString("reverb_app_key"), o.optInt("reverb_port", 8080),
            )
        }
    }

    /** GET /api/clips : historique (ciphertext + métadonnées). */
    fun fetchHistory(serverUrl: String, token: String): List<RawClip> {
        val req = Request.Builder()
            .url("$serverUrl/api/clips")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .get().build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return emptyList()
            val data = JSONObject(resp.body?.string() ?: return emptyList()).getJSONArray("data")
            return (0 until data.length()).map { i ->
                val o = data.getJSONObject(i)
                RawClip(
                    o.getString("id"), o.getString("origin_device_id"),
                    o.getString("ciphertext"), o.getString("nonce"),
                    o.optBoolean("is_sensitive", false), o.getString("created_at"),
                )
            }
        }
    }

    private fun iso8601Now(): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date())
    }
}
