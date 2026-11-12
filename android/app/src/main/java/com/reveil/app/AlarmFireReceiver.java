package com.reveil.app;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/** Déclenché par AlarmManager : notification plein écran + mémorise le tir pour le JS. */
public class AlarmFireReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String alarmId = intent.getStringExtra("alarmId");
        if (alarmId == null) return;
        int rc = intent.getIntExtra("rc", AlarmScheduler.requestCode(alarmId));

        AlarmScheduler.ensureChannel(context);
        AlarmScheduler.onFired(context, alarmId);

        // Contenu de la notification depuis le store JSON.
        String title = "Réveil";
        String body = "Il est temps de bouger";
        try {
            JSONArray alarms = new JSONArray(AlarmScheduler.prefs(context).getString(AlarmScheduler.KEY_ALARMS, "[]"));
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject a = alarms.optJSONObject(i);
                if (a != null && alarmId.equals(a.optString("id"))) {
                    int reps = a.optInt("reps", 0);
                    boolean squat = "squat".equals(a.optString("exercise"));
                    body = reps + " " + (squat ? "squats" : "pompes");
                    break;
                }
            }
        } catch (Exception ignored) {}

        // PendingIntent plein écran → MainActivity avec l'id d'alarme.
        Intent open = new Intent(context, MainActivity.class)
                .putExtra("alarmId", alarmId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(context, rc, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent fullScreenPi = PendingIntent.getActivity(context, rc + 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, AlarmScheduler.CHANNEL_ID)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(contentPi)
                .setFullScreenIntent(fullScreenPi, true);

        NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        try {
            nm.notify(rc, b.build());
        } catch (Throwable t) {
            // POST_NOTIFICATIONS non accordée ou autre : le JS rattrapera au foreground.
        }
    }
}
