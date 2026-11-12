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
        String alarms = call.getString("alarms", "[]");
        AlarmScheduler.scheduleAll(getContext(), alarms);
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        AlarmScheduler.cancelAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSObject ret = new JSObject();
        JSONArray arr = new JSONArray();
        List<JSONObject> list = AlarmScheduler.pendingList(getContext());
        for (JSONObject o : list) arr.put(o);
        ret.put("json", arr.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void consumeFired(PluginCall call) {
        String[] fired = AlarmScheduler.consumeFired(getContext());
        JSObject ret = new JSObject();
        if (fired != null) {
            ret.put("alarmId", fired[0]);
            ret.put("atMs", Long.parseLong(fired[1]));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void test(PluginCall call) {
        AlarmScheduler.scheduleTest(getContext());
        call.resolve();
    }

    @PluginMethod
    public void exactStatus(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            android.app.AlarmManager am = (android.app.AlarmManager) getContext().getSystemService(android.content.Context.ALARM_SERVICE);
            ret.put("status", am != null && am.canScheduleExactAlarms() ? "granted" : "denied");
        } catch (Exception e) {
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
