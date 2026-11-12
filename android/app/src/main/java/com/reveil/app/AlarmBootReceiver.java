package com.reveil.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.UserManager;

/** Reprogramme toutes les alarmes après un redémarrage (données en SharedPreferences). */
public class AlarmBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // SharedPreferences sont chiffrées : ignorés avant le déverrouillage.
        // BOOT_COMPLETED est renvoyé après déverrouillage → la reprogrammation a lieu.
        UserManager um = context.getSystemService(UserManager.class);
        if (um == null || !um.isUserUnlocked()) return;
        AlarmScheduler.rescheduleAll(context);
    }
}
