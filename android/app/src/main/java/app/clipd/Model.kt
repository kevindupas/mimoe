package app.clipd

/** Clip déchiffré, prêt à afficher. */
data class Clip(
    val id: String,
    val originDeviceId: String,
    val text: String,
    val isSensitive: Boolean,
    val createdAt: String,
    val mine: Boolean,
)
