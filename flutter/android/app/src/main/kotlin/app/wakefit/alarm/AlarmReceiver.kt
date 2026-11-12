package app.wakefit.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import org.json.JSONObject

/** Reçoit le déclenchement exact d'AlarmManager, lance la sonnerie et replanifie la prochaine occurrence. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val raw = intent.getStringExtra("alarm") ?: return
        val alarm = JSONObject(raw)

        // 1. Sonnerie + notification plein écran dans un Foreground Service (autorisé depuis une alarme exacte)
        ContextCompat.startForegroundService(
            ctx, Intent(ctx, AlarmService::class.java).putExtra("alarm", raw)
        )

        // 2. Alarme répétitive : planifie déjà la prochaine occurrence ; ponctuelle : on la désactive.
        if (!alarm.has("atMs")) {
            if (alarm.getJSONArray("days").length() > 0) {
                AlarmStore.schedule(ctx, alarm)
            } else {
                alarm.put("enabled", false)
                AlarmStore.save(ctx, alarm)
            }
        }
    }
}
