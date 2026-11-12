import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** Pont vers le plugin natif WakeAlarm (AlarmManager + full-screen intent). */
export interface WakeAlarmPlugin {
  scheduleAll(opts: { alarms: string }): Promise<void>;
  cancelAll(): Promise<void>;
  pending(): Promise<{ json: string }>;
  consumeFired(): Promise<{ alarmId?: string; atMs?: number }>;
  test(): Promise<void>;
  exactStatus(): Promise<{ status: string }>;
  openExactSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  addListener(
    event: "alarmFired",
    cb: (e: { alarmId: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const WakeAlarm = registerPlugin<WakeAlarmPlugin>("WakeAlarm");
