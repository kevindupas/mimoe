package app.clipd

import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Crypto E2E, STRICTEMENT identique a la version Rust (mac/src-tauri/src/crypto.rs) :
 * Argon2id (meme sel + memes params) -> cle AES-256 -> AES-256-GCM.
 * Interop verifiee par test (Rust dechiffre le ciphertext produit ici).
 */
object Crypto {
    // DOIT etre identique a SHARED_SALT cote Rust.
    private val SHARED_SALT = "clipd::v1::shared-salt::do-not-change".toByteArray(Charsets.UTF_8)

    fun deriveKey(passphrase: String): ByteArray {
        val params = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withVersion(Argon2Parameters.ARGON2_VERSION_13)
            .withIterations(3)
            .withMemoryAsKB(64 * 1024)
            .withParallelism(1)
            .withSalt(SHARED_SALT)
            .build()
        val gen = Argon2BytesGenerator()
        gen.init(params)
        val key = ByteArray(32)
        gen.generateBytes(passphrase.toByteArray(Charsets.UTF_8), key)
        return key
    }

    /** Chiffre. Retourne (ciphertext, nonce) tous deux en base64 standard. */
    fun encrypt(key: ByteArray, plaintext: String): Pair<String, String> {
        val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.ENCRYPT_MODE,
            SecretKeySpec(key, "AES"),
            GCMParameterSpec(128, nonce),
        )
        val ct = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8)) // ct||tag
        val b64 = android.util.Base64.NO_WRAP
        return Pair(
            android.util.Base64.encodeToString(ct, b64),
            android.util.Base64.encodeToString(nonce, b64),
        )
    }

    /** Dechiffre un clip recu (ciphertext + nonce en base64). */
    fun decrypt(key: ByteArray, ciphertextB64: String, nonceB64: String): String {
        val b64 = android.util.Base64.NO_WRAP
        val ct = android.util.Base64.decode(ciphertextB64, b64)
        val nonce = android.util.Base64.decode(nonceB64, b64)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(key, "AES"),
            GCMParameterSpec(128, nonce),
        )
        return String(cipher.doFinal(ct), Charsets.UTF_8)
    }
}
