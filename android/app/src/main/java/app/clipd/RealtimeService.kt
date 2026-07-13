package app.clipd

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.pusher.client.Pusher
import com.pusher.client.PusherOptions
import com.pusher.client.channel.PrivateChannelEventListener
import com.pusher.client.channel.PusherEvent
import com.pusher.client.util.HttpAuthorizer
import org.json.JSONObject

/**
 * Service en premier plan : tient la connexion WebSocket (Reverb / protocole Pusher)
 * pour recevoir les clips en temps réel, même app fermée. Notif permanente obligatoire
 * (seule façon fiable de recevoir en fond sur Android).
 */
class RealtimeService : Service() {

    private var pusher: Pusher? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannels()
        startForeground(SERVICE_NOTIF_ID, serviceNotification())
        connect()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    private fun connect() {
        val store = SecureStore(this)
        if (!store.isConfigured()) { stopSelf(); return }

        val authorizer = HttpAuthorizer("${store.serverUrl}/broadcasting/auth").apply {
            setHeaders(mapOf(
                "Authorization" to "Bearer ${store.deviceToken}",
                "Accept" to "application/json",
            ))
        }
        val options = PusherOptions().apply {
            setHost(store.reverbHost)
            setWsPort(store.reverbPort)
            setWssPort(store.reverbPort)
            isUseTLS = store.reverbScheme == "https"
            setAuthorizer(authorizer)
        }

        pusher = Pusher(store.reverbAppKey, options).also { p ->
            p.connect()
            p.subscribePrivate("private-clips.${store.userId}", object : PrivateChannelEventListener {
                override fun onEvent(event: PusherEvent) = handleEvent(event, store)
                override fun onAuthenticationFailure(msg: String?, e: Exception?) {}
                override fun onSubscriptionSucceeded(channel: String?) {}
            }, "clip.received")
        }
    }

    private fun handleEvent(event: PusherEvent, store: SecureStore) {
        try {
            val o = JSONObject(event.data)
            val origin = o.getString("origin_device_id")
            if (origin == store.deviceId) return // c'est nous
            val key = store.getKey() ?: return
            val text = Crypto.decrypt(key, o.getString("ciphertext"), o.getString("nonce"))
            val clip = Clip(
                id = o.getString("id"),
                originDeviceId = origin,
                text = text,
                isSensitive = o.optBoolean("is_sensitive", false),
                createdAt = o.getString("created_at"),
                mine = false,
            )
            store.addClip(clip)
            ClipBus.add(clip)
            notifyClip(text)
        } catch (_: Exception) {
        }
    }

    private fun notifyClip(text: String) {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(this, CLIP_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle("Nouveau clip")
            .setContentText(if (text.length > 80) text.take(80) + "…" else text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text.take(400)))
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        nm().notify((System.nanoTime() and 0xFFFFFF).toInt(), n)
    }

    private fun serviceNotification(): Notification =
        NotificationCompat.Builder(this, SERVICE_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_upload)
            .setContentTitle("Clipd actif")
            .setContentText("Réception des clips en temps réel")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun createChannels() {
        if (Build.VERSION.SDK_INT >= 26) {
            nm().createNotificationChannel(
                NotificationChannel(SERVICE_CHANNEL, "Service", NotificationManager.IMPORTANCE_LOW)
            )
            nm().createNotificationChannel(
                NotificationChannel(CLIP_CHANNEL, "Nouveaux clips", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
    }

    private fun nm() = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    override fun onDestroy() {
        pusher?.disconnect()
        pusher = null
        super.onDestroy()
    }

    companion object {
        private const val SERVICE_CHANNEL = "clipd_service"
        private const val CLIP_CHANNEL = "clipd_clips"
        private const val SERVICE_NOTIF_ID = 1

        fun start(ctx: Context) {
            val i = Intent(ctx, RealtimeService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, RealtimeService::class.java))
        }
    }
}
