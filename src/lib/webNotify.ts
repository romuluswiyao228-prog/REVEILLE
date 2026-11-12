import { isNative } from "./nativeAlarms";
import type { Alarm } from "./types";

let asked = false;

/** Demande la permission Notification une fois (premier geste utilisateur, web uniquement). */
export async function ensureNotifyPermission() {
  if (isNative() || !("Notification" in window) || asked) return;
  asked = true;
  try {
    if (Notification.permission === "default") await Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

/** Notification système quand l'alarme se déclenche (page encore vivante). */
export function notifyAlarm(alarm: Alarm) {
  if (isNative() || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification("Réveil", {
      body: `${alarm.reps} ${alarm.exercise === "squat" ? "squats" : "pompes"} — touche pour commencer`,
      tag: `alarm-${alarm.id}`,
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}
