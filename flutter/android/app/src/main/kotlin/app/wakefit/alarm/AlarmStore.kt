package app.wakefit.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Persistance native des alarmes (SharedPreferences, device-protected storage pour lire
 * avant le déverrouillage) + calcul de la prochaine occurrence + planification.
 * Le BootReceiver n'a pas besoin du moteur Flutter pour tout replanifier.
 */
object AlarmStore {
    private const val PREFS = "wakefit_alarms"
    private const val KEY = "alarms"

    private fun prefs(ctx: Context) =
        ctx.createDeviceProtectedStorageContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun all(ctx: Context): JSONArray = JSONArray(prefs(ctx).getString(KEY, "[]"))

    fun save(ctx: Context, alarm: JSONObject) {
        val list = all(ctx)
        val out = JSONArray()
        for (i in 0 until list.length()) if (list.getJSONObject(i).getInt("id") != alarm.getInt("id")) out.put(list.get(i))
        out.put(alarm)
        prefs(ctx).edit().putString(KEY, out.toString()).apply()
    }

    fun remove(ctx: Context, id: Int) {
        val list = all(ctx)
        val out = JSONArray()
        for (i in 0 until list.length()) if (list.getJSONObject(i).getInt("id") != id) out.put(list.get(i))
        prefs(ctx).edit().putString(KEY, out.toString()).apply()
    }

    /** days : 1 = lundi … 7 = dimanche ; vide = une fois. */
    fun nextTrigger(hour: Int, minute: Int, days: JSONArray, from: Long = System.currentTimeMillis()): Long {
        for (offset in 0..7) {
            val c = Calendar.getInstance().apply {
                timeInMillis = from
                add(Calendar.DAY_OF_YEAR, offset)
                set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, minute)
                set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            }
            if (c.timeInMillis <= from) continue
            val isoDay = ((c.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1 // Calendar: dim=1 → iso: lun=1
            var ok = days.length() == 0
            for (i in 0 until days.length()) if (days.getInt(i) == isoDay) ok = true
            if (ok) return c.timeInMillis
        }
        return from + 24 * 3600 * 1000
    }

    fun schedule(ctx: Context, alarm: JSONObject) {
        val id = alarm.getInt("id")
        val at = if (alarm.has("atMs")) alarm.getLong("atMs")
        else nextTrigger(alarm.getInt("hour"), alarm.getInt("minute"), alarm.getJSONArray("days"))

        // Un report (atMs) utilise un autre requestCode pour ne PAS écraser la prochaine occurrence récurrente.
        val req = if (alarm.has("atMs")) id xor 0x40000000 else id
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val fire = PendingIntent.getBroadcast(
            ctx, req, Intent(ctx, AlarmReceiver::class.java).putExtra("alarm", alarm.toString()),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val show = PendingIntent.getActivity(
            ctx, req, ctx.packageManager.getLaunchIntentForPackage(ctx.packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        // setAlarmClock : exempté du Doze, déclenché à la seconde près, icône d'alarme dans la barre d'état.
        am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), fire)
    }

    fun cancel(ctx: Context, id: Int) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        for (req in intArrayOf(id, id xor 0x40000000)) {
            val fire = PendingIntent.getBroadcast(
                ctx, req, Intent(ctx, AlarmReceiver::class.java),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            if (fire != null) am.cancel(fire)
        }
    }

    fun rescheduleAll(ctx: Context) {
        val list = all(ctx)
        for (i in 0 until list.length()) {
            val a = list.getJSONObject(i)
            if (a.optBoolean("enabled", true)) schedule(ctx, a)
        }
    }
}
