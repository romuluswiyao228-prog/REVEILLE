package com.reveil.app;

import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.List;

import org.json.JSONObject;

@CapacitorPlugin(name = "WakeAlarm")
public class WakeAlarmPlugin extends Plugin {

    @PluginMethod
    public void scheduleAll(PluginCall call) {
        try {
            String alarms = call.getString("alarms", "[]");
            AlarmScheduler.scheduleAll(getContext(), alarms);
        } catch (Throwable t) {
            call.reject("scheduleAll failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        try {
            AlarmScheduler.cancelAll(getContext());
        } catch (Throwable t) {
            call.reject("cancelAll failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            JSONArray arr = new JSONArray();
            List<JSONObject> list = AlarmScheduler.pendingList(getContext());
            for (JSONObject o : list) arr.put(o);
            ret.put("json", arr.toString());
        } catch (Throwable t) {
            ret.put("json", "[]");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void consumeFired(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            String[] fired = AlarmScheduler.consumeFired(getContext());
            if (fired != null) {
                ret.put("alarmId", fired[0]);
                ret.put("atMs", Long.parseLong(fired[1]));
            }
        } catch (Throwable t) {
            /* retourne vide */
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void test(PluginCall call) {
        try {
            AlarmScheduler.scheduleTest(getContext());
        } catch (Throwable t) {
            call.reject("test failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void exactStatus(PluginCall call) {
        JSObject ret = new JSObject();
        // canScheduleExactAlarms n'existe qu'à partir d'API 31 : en dessous,
        // les alarmes exactes sont toujours autorisées (permission install-time).
        if (Build.VERSION.SDK_INT < 31) {
            ret.put("status", "granted");
            call.resolve(ret);
            return;
        }
        try {
            android.app.AlarmManager am = (android.app.AlarmManager) getContext().getSystemService(android.content.Context.ALARM_SERVICE);
            ret.put("status", am != null && am.canScheduleExactAlarms() ? "granted" : "denied");
        } catch (Throwable t) {
            ret.put("status", "unknown");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openExactSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            i.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
            getContext().startActivity(i);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            getContext().startActivity(i);
        } catch (Exception ignored) {}
        call.resolve();
    }

    /** Appelé par MainActivity quand l'app est rouverte par une notification d'alarme. */
    static void deliverFired(com.getcapacitor.Bridge bridge, String alarmId) {
        if (bridge == null) return;
        try {
            com.getcapacitor.PluginHandle handle = bridge.getPlugin("WakeAlarm");
            Plugin instance = handle == null ? null : handle.getInstance();
            if (instance instanceof WakeAlarmPlugin) {
                JSObject data = new JSObject();
                data.put("alarmId", alarmId);
                ((WakeAlarmPlugin) instance).notifyListeners("alarmFired", data);
            }
        } catch (Exception ignored) {}
    }
}
