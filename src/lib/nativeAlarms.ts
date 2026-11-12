import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import type { Alarm, HistoryEntry } from "./types";

/** true uniquement dans l'APK Android : sur le web/PWA rien de tout ceci ne s'exécute. */
export const isNative = () => Capacitor.isNativePlatform();

const SOUNDS = ["sunrise", "pulse", "digital", "siren", "beacon"] as const;
const CHANNEL_PREFIX = "wakefit_";
const ONCE_KEY = "wf_once_scheduled"; // alarmId -> atMs des alarmes "une seule fois"

// id de notification stable : hash de l'id alarme (24 bits) * 8 + index de jour (7 = ponctuelle)
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h & 0xffffff;
}
const notifId = (alarmId: string, dayIdx: number) => hashId(alarmId) * 8 + dayIdx;

function nextAt(time: string, day: number | null, from = new Date()): Date {
  const [h, m] = time.split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= from.getTime()) continue;
    if (day === null || d.getDay() === day) return d;
  }
  const d = new Date(from);
  d.setDate(from.getDate() + 8);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Dernière occurrence passée d'une alarme (pour la règle des 30 min). */
function lastOccurrence(a: Alarm, now = new Date()): Date | null {
  const [h, m] = a.time.split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(h, m, 0, 0);
    if (d.getTime() > now.getTime()) continue;
    if (a.days.length === 0 || a.days.includes(d.getDay())) return d;
  }
  return null;
}

async function ensureChannels() {
  for (const s of SOUNDS) {
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_PREFIX + s,
        name: `Réveil — ${s}`,
        description: `Sonnerie ${s}`,
        importance: 4, // IMPORTANCE_HIGH : heads-up
        visibility: 1,
        sound: s, // android/app/src/main/res/raw/<s>.wav
        vibration: true,
        lights: true,
      });
    } catch {
      /* canal déjà existant ou son non résolu : on continue */
    }
  }
}

async function requestPermissions() {
  try {
    await LocalNotifications.requestPermissions();
  } catch {
    /* web ou refus */
  }
}

export async function exactAlarmStatus(): Promise<string> {
  try {
    return String(await LocalNotifications.checkExactNotificationSetting());
  } catch {
    return "unknown";
  }
}

export async function openExactAlarmSettings() {
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    /* non supporté */
  }
}

export async function notificationPermission(): Promise<string> {
  try {
    const p = await LocalNotifications.checkPermissions();
    return String(p.display);
  } catch {
    return "unknown";
  }
}

/** Notification de test à +60 s (diagnostic, mode natif). */
export async function scheduleTestNotification() {
  if (!isNative()) return;
  await ensureChannels();
  await LocalNotifications.schedule({
    notifications: [{
      id: 999999,
      title: "Réveil",
      body: "Test — alarme dans 1 minute",
      channelId: CHANNEL_PREFIX + "sunrise",
      schedule: { at: new Date(Date.now() + 60_000), allowWhileIdle: true },
    }],
  });
}

/** Programme (ou reprogramme) toutes les alarmes actives. Idempotent : même id = mise à jour. */
export async function syncNativeAlarms(alarms: Alarm[]) {
  if (!isNative()) return;
  await ensureChannels();

  // Ponctuelles déjà déclenchées pendant que l'app était fermée → on les désactive.
  const fired = new Set<string>();
  try {
    const { value } = await Preferences.get({ key: ONCE_KEY });
    const old: Record<string, number> = value ? JSON.parse(value) : {};
    const pending = await LocalNotifications.getPending();
    const pendingIds = new Set(pending.notifications.map((n) => n.id));
    for (const [aid, atMs] of Object.entries(old)) {
      if (atMs <= Date.now() && !pendingIds.has(notifId(aid, 7))) fired.add(aid);
    }
  } catch {
    /* ignore */
  }
  for (const id of fired) firedOnce.add(id);

  const enabled = alarms.filter((a) => a.enabled && !(a.days.length === 0 && firedOnce.has(a.id)));
  const expected = new Set<number>();
  const onceMap: Record<string, number> = {};

  const notifications = [];
  for (const a of enabled) {
    const channelId = CHANNEL_PREFIX + (SOUNDS.includes(a.sound as (typeof SOUNDS)[number]) ? a.sound : "sunrise");
    const base = {
      title: "Réveil",
      body: `${a.reps} ${a.exercise === "squat" ? "squats" : "pompes"}`,
      channelId,
      extra: { alarmId: a.id, exercise: a.exercise, reps: a.reps },
    };
    if (a.days.length === 0) {
      const at = nextAt(a.time, null);
      const id = notifId(a.id, 7);
      expected.add(id);
      onceMap[a.id] = at.getTime();
      notifications.push({ ...base, id, schedule: { at, allowWhileIdle: true } });
    } else {
      for (const d of a.days) {
        const idx = [1, 2, 3, 4, 5, 6, 0].indexOf(d); // index stable 0..6
        const at = nextAt(a.time, d);
        const id = notifId(a.id, idx);
        expected.add(id);
        notifications.push({ ...base, id, schedule: { at, every: "week" as const, allowWhileIdle: true } });
      }
    }
  }

  if (notifications.length) {
    try {
      await LocalNotifications.schedule({ notifications });
    } catch {
      /* un à un en secours */
      for (const n of notifications) {
        try {
          await LocalNotifications.schedule({ notifications: [n] });
        } catch {
          /* ignore */
        }
      }
    }
  }
  try {
    await Preferences.set({ key: ONCE_KEY, value: JSON.stringify(onceMap) });
  } catch {
    /* ignore */
  }
}

/** Alarme "une seule fois" qui a sonné pendant que l'app était fermée. */
export const firedOnce = new Set<string>();

/** Annule toutes les notifications puis reprogramme : couvre création/modif/activation/désactivation/suppression. */
export async function resyncAlarms(alarms: Alarm[]) {
  if (!isNative()) return;
  try {
    const pending = await LocalNotifications.getPending();
    for (const n of pending.notifications) {
      try {
        await LocalNotifications.cancel({ notifications: [{ id: n.id }] });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  await syncNativeAlarms(alarms);
}

export interface PendingInfo {
  id: number;
  at: number;
}

export async function pendingNotifications(): Promise<PendingInfo[]> {
  if (!isNative()) return [];
  try {
    const p = await LocalNotifications.getPending();
    return p.notifications.map((n) => ({
      id: n.id,
      at: n.schedule && "at" in n.schedule && n.schedule.at instanceof Date ? n.schedule.at.getTime() : 0,
    }));
  } catch {
    return [];
  }
}

export interface NativeAlarmHooks {
  onNotificationTap: (alarmId: string) => void;
  onMissedAlarm: (alarmId: string) => void;
  onOneShotFired: (alarmId: string) => void;
}

let listenersReady = false;

/** À appeler une fois au démarrage (mode natif) : permissions, canaux, listeners, filet de sécurité. */
export async function initNativeAlarms(hooks: NativeAlarmHooks) {
  if (!isNative() || listenersReady) return;
  listenersReady = true;
  await requestPermissions();
  await ensureChannels();

  await LocalNotifications.addListener("localNotificationActionPerformed", (ev) => {
    const aid = (ev.notification.extra as { alarmId?: string } | undefined)?.alarmId;
    if (aid) hooks.onNotificationTap(aid);
  });

  // Retour au premier plan : vérifie les alarmes manquées (< 30 min, non terminées).
  await App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void checkMissed(alarmsRef.current, hooks, historyRef.current);
  });
}

const alarmsRef: { current: Alarm[] } = { current: [] };
const historyRef: { current: HistoryEntry[] } = { current: [] };
export function setNativeAlarmsRef(alarms: Alarm[]) {
  alarmsRef.current = alarms;
}
export function setNativeHistoryRef(history: HistoryEntry[]) {
  historyRef.current = history;
}

async function checkMissed(alarms: Alarm[], hooks: NativeAlarmHooks, history: HistoryEntry[] = []) {
  const now = Date.now();
  for (const a of alarms) {
    if (!a.enabled) continue;
    const occ = lastOccurrence(a);
    if (!occ || now - occ.getTime() > 30 * 60 * 1000) continue;
    const done = history.some((h) => h.success && h.ts >= occ.getTime());
    if (!done) hooks.onMissedAlarm(a.id);
  }
}

/** Vérifie au lancement : permissions exactes + alarmes passées < 30 min. */
export async function startupChecks(alarms: Alarm[], history: HistoryEntry[], hooks: NativeAlarmHooks) {
  if (!isNative()) return;
  setNativeAlarmsRef(alarms);
  const exact = await exactAlarmStatus();
  if (exact !== "granted") void openExactAlarmSettings();
  await checkMissed(alarms, hooks, history);
  // Filet de sécurité : reprogramme ce qui manque par rapport à getPending().
  const expected = new Set<number>();
  for (const a of alarms.filter((x) => x.enabled)) {
    if (a.days.length === 0) expected.add(notifId(a.id, 7));
    else for (const d of a.days) expected.add(notifId(a.id, [1, 2, 3, 4, 5, 6, 0].indexOf(d)));
  }
  const pending = await pendingNotifications();
  const have = new Set(pending.map((p) => p.id));
  if ([...expected].some((id) => !have.has(id))) await syncNativeAlarms(alarms);
}
