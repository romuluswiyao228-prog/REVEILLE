package app.wakefit.alarm

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.*
import android.net.Uri
import android.os.*
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/**
 * Foreground Service : joue la sonnerie en boucle (USAGE_ALARM → ignore le mode silencieux des médias)
 * jusqu'à ce que Flutter appelle `stopRinging` (mission réussie).
 */
class AlarmService : Service() {
    private var player: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var vibrator: Vibrator? = null

    companion object {
        const val CHANNEL = "wakefit_ringing"
        const val ACTION_STOP = "app.wakefit.STOP"
        var currentAlarmId: Int? = null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val alarm = JSONObject(intent?.getStringExtra("alarm") ?: return START_NOT_STICKY)
        currentAlarmId = alarm.getInt("id")

        createChannel()
        val open = Intent(this, Class.forName("$packageName.MainActivity")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("ringingAlarmId", alarm.getInt("id"))
        }
        val pi = PendingIntent.getActivity(this, alarm.getInt("id"), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val notif = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(alarm.optString("label").ifEmpty { "WakeFit" })
            .setContentText("${alarm.optInt("reps")} ${alarm.optString("exercise")} — touche pour commencer la mission")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true) // non balayable : l'alarme ne s'arrête qu'avec la mission
            .setFullScreenIntent(pi, true) // ouvre automatiquement l'écran de mission
            .setContentIntent(pi)
            .build()

        if (Build.VERSION.SDK_INT >= 29)
            startForeground(1, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(1, notif)

        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wakefit:ring").apply { acquire(30 * 60 * 1000L) }

        startSound(alarm)
        startVibration()
        return START_STICKY
    }

    private fun startSound(alarm: JSONObject) {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val name = alarm.optString("sound", "sunrise")
        val resId = resources.getIdentifier(name, "raw", packageName) // android/app/src/main/res/raw/sunrise.mp3
        val uri = if (resId != 0) Uri.parse("android.resource://$packageName/$resId")
        else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        player = MediaPlayer().apply {
            setAudioAttributes(attrs)
            setDataSource(this@AlarmService, uri)
            isLooping = true
            val v = alarm.optDouble("volume", 0.8).toFloat()
            setVolume(v, v)
            prepare(); start()
        }
    }

    private fun startVibration() {
        vibrator = if (Build.VERSION.SDK_INT >= 31)
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        else @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 400), 0))
    }

    private fun createChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Alarme en cours", NotificationManager.IMPORTANCE_HIGH).apply {
                    setSound(null, null) // le son est géré par MediaPlayer
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setBypassDnd(true)
                }
            )
        }
    }

    override fun onDestroy() {
        player?.run { stop(); release() }
        vibrator?.cancel()
        wakeLock?.takeIf { it.isHeld }?.release()
        currentAlarmId = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
