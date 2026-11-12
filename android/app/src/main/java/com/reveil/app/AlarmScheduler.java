package com.reveil.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Planification native des alarmes : AlarmManager exact + SharedPreferences.
 * Les alarmes sont transmises par le JS sous forme de JSON
 * [{id,time:"HH:MM",days:[0..6] (vide = une seule fois),exercise,reps,sound,enabled}].
 */
public class AlarmScheduler {

    static final String PREFS = "wakefit_native";
    static final String KEY_ALARMS = "alarmsJson";
    static final String KEY_PENDING = "pendingJson";
    static final String KEY_FIRED_ID = "firedId";
    static final String KEY_FIRED_AT = "firedAt";
    static final String CHANNEL_ID = "wakefit_native";

    private AlarmScheduler() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static int requestCode(String alarmId) {
        return alarmId.hashCode() & 0x7fffffff;
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Réveil", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Alarme WakeFit");
        ch.enableVibration(true);
        ch.enableLights(true);
        ch.setSound(Uri.parse("android.resource://" + ctx.getPackageName() + "/raw/sunrise"), null);
        nm.createNotificationChannel(ch);
    }

    /** Prochaine occurrence > now pour une alarme. days: 0=dim..6=sam (getDay JS), vide = une fois. */
    static long nextTrigger(JSONObject a, long now) {
        try {
            String[] p = a.getString("time").split(":");
            int h = Integer.parseInt(p[0]);
            int m = Integer.parseInt(p[1]);
            JSONArray days = a.optJSONArray("days");
            Calendar base = Calendar.getInstance();
            for (int i = 0; i < 8; i++) {
                Calendar c = (Calendar) base.clone();
                c.add(Calendar.DAY_OF_YEAR, i);
                c.set(Calendar.HOUR_OF_DAY, h);
                c.set(Calendar.MINUTE, m);
                c.set(Calendar.SECOND, 0);
                c.set(Calendar.MILLISECOND, 0);
                if (c.getTimeInMillis() <= now) continue;
                if (days == null || days.length() == 0 || dayAllowed(days, c)) return c.getTimeInMillis();
            }
        } catch (Exception ignored) {}
        return -1;
    }

    private static boolean dayAllowed(JSONArray days, Calendar c) {
        // Calendar.DAY_OF_WEEK: 1=dim..7=sam → équivalent getDay JS 0..6
        int jsDay = c.get(Calendar.DAY_OF_WEEK) - 1;
        for (int i = 0; i < days.length(); i++) {
            if (days.optInt(i, -1) == jsDay) return true;
        }
        return false;
    }

    private static boolean isRepeating(JSONObject a) {
        JSONArray days = a.optJSONArray("days");
        return days != null && days.length() > 0;
    }

    private static PendingIntent fireIntent(Context ctx, String alarmId, int rc) {
        Intent i = new Intent(ctx, AlarmFireReceiver.class)
                .putExtra("alarmId", alarmId)
                .putExtra("rc", rc)
                .setPackage(ctx.getPackageName());
        return PendingIntent.getBroadcast(ctx, rc, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void arm(Context ctx, AlarmManager am, JSONObject a, long trigger) {
        int rc = requestCode(a.optString("id"));
        PendingIntent pi = fireIntent(ctx, a.optString("id"), rc);
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
        }
    }

    /** Remplace toute la planification par la liste JSON reçue du JS. */
    static void scheduleAll(Context ctx, String alarmsJson) {
        ensureChannel(ctx);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        cancelAllInternal(ctx, am);

        JSONArray pending = new JSONArray();
        long now = System.currentTimeMillis();
        try {
            JSONArray alarms = new JSONArray(alarmsJson == null ? "[]" : alarmsJson);
            // On conserve toutes les alarmes (même désactivées) pour info, mais on ne programme que les actives.
            prefs(ctx).edit().putString(KEY_ALARMS, alarmsJson == null ? "[]" : alarmsJson).apply();
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject a = alarms.optJSONObject(i);
                if (a == null || !a.optBoolean("enabled", false)) continue;
                long at = nextTrigger(a, now);
                if (at < 0) continue;
                arm(ctx, am, a, at);
                pending.put(new JSONObject()
                        .put("alarmId", a.optString("id"))
                        .put("atMs", at)
                        .put("rc", requestCode(a.optString("id"))));
            }
        } catch (JSONException ignored) {}
        prefs(ctx).edit().putString(KEY_PENDING, pending.toString()).apply();
    }

    /** Annule toutes les alarmes programmées (les données restent). */
    static void cancelAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        cancelAllInternal(ctx, am);
    }

    private static void cancelAllInternal(Context ctx, AlarmManager am) {
        String pj = prefs(ctx).getString(KEY_PENDING, "[]");
        try {
            JSONArray pending = new JSONArray(pj);
            for (int i = 0; i < pending.length(); i++) {
                JSONObject p = pending.optJSONObject(i);
                if (p == null) continue;
                int rc = p.optInt("rc");
                PendingIntent pi = PendingIntent.getBroadcast(ctx, rc,
                        new Intent(ctx, AlarmFireReceiver.class).setPackage(ctx.getPackageName()),
                        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pi != null) {
                    am.cancel(pi);
                    pi.cancel();
                }
            }
        } catch (JSONException ignored) {}
        prefs(ctx).edit().putString(KEY_PENDING, "[]").apply();
    }

    /** Reprogramme tout depuis le store (boot, remplacement de package). */
    static void rescheduleAll(Context ctx) {
        String alarms = prefs(ctx).getString(KEY_ALARMS, "[]");
        scheduleAll(ctx, alarms);
    }

    /** Alarme de test à +60 s. */
    static void scheduleTest(Context ctx) {
        ensureChannel(ctx);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        String id = "__test__";
        int rc = requestCode(id);
        PendingIntent pi = fireIntent(ctx, id, rc);
        long at = System.currentTimeMillis() + 60_000;
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
        try {
            JSONArray pending = new JSONArray(prefs(ctx).getString(KEY_PENDING, "[]"));
            pending.put(new JSONObject().put("alarmId", id).put("atMs", at).put("rc", rc));
            prefs(ctx).edit().putString(KEY_PENDING, pending.toString()).apply();
        } catch (JSONException ignored) {}
    }

    /** Appelé par AlarmFireReceiver : mémorise le tir, replanifie si récurrent, met à jour pending. */
    static void onFired(Context ctx, String alarmId) {
        long now = System.currentTimeMillis();
        prefs(ctx).edit()
                .putString(KEY_FIRED_ID, alarmId)
                .putLong(KEY_FIRED_AT, now)
                .apply();

        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        try {
            JSONArray alarms = new JSONArray(prefs(ctx).getString(KEY_ALARMS, "[]"));
            JSONObject match = null;
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject a = alarms.optJSONObject(i);
                if (a != null && alarmId.equals(a.optString("id"))) { match = a; break; }
            }
            JSONArray pending = new JSONArray(prefs(ctx).getString(KEY_PENDING, "[]"));
            JSONArray next = new JSONArray();
            boolean rescheduled = false;
            for (int i = 0; i < pending.length(); i++) {
                JSONObject p = pending.optJSONObject(i);
                if (p == null) continue;
                if (!alarmId.equals(p.optString("alarmId"))) { next.put(p); continue; }
                //entrée pour cette alarme : replanifier seulement si elle est récurrente et active
                if (match != null && match.optBoolean("enabled", false) && isRepeating(match)) {
                    long at = nextTrigger(match, now);
                    if (at > 0) {
                        arm(ctx, am, match, at);
                        next.put(new JSONObject()
                                .put("alarmId", alarmId).put("atMs", at).put("rc", p.optInt("rc")));
                        rescheduled = true;
                    }
                }
            }
            if (!rescheduled && match != null && match.optBoolean("enabled", false) && isRepeating(match)) {
                long at = nextTrigger(match, now);
                if (at > 0) {
                    arm(ctx, am, match, at);
                    next.put(new JSONObject()
                            .put("alarmId", alarmId).put("atMs", at).put("rc", requestCode(alarmId)));
                }
            }
            prefs(ctx).edit().putString(KEY_PENDING, next.toString()).apply();
        } catch (JSONException ignored) {}
    }

    /** Lit et efface l'alarme déclenchée (consommée par le JS). */
    static String[] consumeFired(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String id = p.getString(KEY_FIRED_ID, null);
        long at = p.getLong(KEY_FIRED_AT, 0);
        p.edit().remove(KEY_FIRED_ID).remove(KEY_FIRED_AT).apply();
        if (id == null) return null;
        return new String[]{id, String.valueOf(at)};
    }

    static List<JSONObject> pendingList(Context ctx) {
        List<JSONObject> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs(ctx).getString(KEY_PENDING, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null) out.add(o);
            }
        } catch (JSONException ignored) {}
        return out;
    }
}
