package app.wakefit.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Redémarrage, changement d'heure/fuseau, mise à jour de l'app → toutes les alarmes sont replanifiées. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        AlarmStore.rescheduleAll(ctx)
    }
}
