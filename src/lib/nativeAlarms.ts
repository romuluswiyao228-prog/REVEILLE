import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { WakeAlarm } from "./wakeAlarm";
import type { Alarm, HistoryEntry } from "./types";

/** true uniquement dans l'APK Android : sur le web/PWA rien de tout ceci ne s'exécute. */
export const isNative = () => Capacitor.isNativePlatform();

const ONCE_KEY = "wf_once_scheduled"; // alarmId -> atMs des alarmes "une seule fois"
const MISSED_WINDOW_MS = 30 * 60 * 1000;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h & 0xffffff;
}

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

/** Prochaine occurrence pour une alarme "une seule fois" (jours vides). */
function nextOnceMs(a: Alarm): number {
  return nextAt(a.time, null).getTime();
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

async function requestPermissions() {
  try {
    await LocalNotifications.requestPermissions(); // POST_NOTIFICATIONS (Android 13+)
  } catch {
    /* web ou refus */
  }
}

export async function exactAlarmStatus(): Promise<string> {
  try {
    const r = await WakeAlarm.exactStatus();
    return String(r.status);
  } catch {
    return "unknown";
  }
}

export async function openExactAlarmSettings() {
  try {
    await WakeAlarm.openExactSettings();
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

interface PendingNative {
  alarmId: string;
  atMs: number;
  rc: number;
}

async function nativePending(): Promise<PendingNative[]> {
  try {
    const r = await WakeAlarm.pending();
    const arr = JSON.parse(r.json || "[]") as PendingNative[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Notification de test à +60 s (diagnostic, mode natif). */
export async function scheduleTestNotification() {
  if (!isNative()) return;
  try {
    await WakeAlarm.test();
  } catch {
    /* ignore */
  }
}

function toPayload(a: Alarm) {
  return {
    id: a.id,
    time: a.time,
    days: a.days,
    exercise: a.exercise,
    reps: a.reps,
    sound: a.sound,
    enabled: true,
  };
}

/** Programme (ou reprogramme) toutes les alarmes actives via AlarmManager. Idempotent. */
export async function syncNativeAlarms(alarms: Alarm[]) {
  if (!isNative()) return;

  // Ponctuelles déjà déclenchées pendant que l'app était fermée → on les désactive.
  const fired = new Set<string>();
  try {
    const { value } = await Preferences.get({ key: ONCE_KEY });
    const old: Record<string, number> = value ? JSON.parse(value) : {};
    const pendingIds = new Set((await nativePending()).map((p) => p.alarmId));
    for (const [aid, atMs] of Object.entries(old)) {
      if (atMs <= Date.now() && !pendingIds.has(aid)) fired.add(aid);
    }
  } catch {
    /* ignore */
  }
  for (const id of fired) firedOnce.add(id);

  const enabled = alarms.filter((a) => a.enabled && !(a.days.length === 0 && firedOnce.has(a.id)));
  const onceMap: Record<string, number> = {};
  for (const a of enabled) {
    if (a.days.length === 0) onceMap[a.id] = nextOnceMs(a);
  }

  try {
    await WakeAlarm.scheduleAll({ alarms: JSON.stringify(enabled.map(toPayload)) });
  } catch {
    /* ignore */
  }
  try {
    await Preferences.set({ key: ONCE_KEY, value: JSON.stringify(onceMap) });
  } catch {
    /* ignore */
  }
}

/** Alarme "une seule fois" qui a sonné pendant que l'app était fermée. */
export const firedOnce = new Set<string>();

/** Reprogramme tout : scheduleAll est autoritaire (annule puis replanifie côté natif). */
export async function resyncAlarms(alarms: Alarm[]) {
  if (!isNative()) return;
  await syncNativeAlarms(alarms);
}

export interface PendingInfo {
  id: number;
  at: number;
}

export async function pendingNotifications(): Promise<PendingInfo[]> {
  if (!isNative()) return [];
  return (await nativePending()).map((p) => ({ id: hashId(p.alarmId), at: p.atMs }));
}

export interface NativeAlarmHooks {
  onNotificationTap: (alarmId: string) => void;
  onMissedAlarm: (alarmId: string) => void;
  onOneShotFired: (alarmId: string) => void;
}

let listenersReady = false;

/** Alarme déclenchée côté natif et pas encore consommée par le JS (fenêtre 30 min). */
export async function consumeFiredAlarm(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const r = await WakeAlarm.consumeFired();
    if (!r.alarmId || r.alarmId === "__test__") return null;
    if (r.atMs && Date.now() - r.atMs > MISSED_WINDOW_MS) return null;
    return r.alarmId;
  } catch {
    return null;
  }
}

/** À appeler une fois au démarrage (mode natif) : permissions, listeners, filet de sécurité. */
export async function initNativeAlarms(hooks: NativeAlarmHooks) {
  if (!isNative() || listenersReady) return;
  listenersReady = true;
  await requestPermissions();

  // Tir natif → écran bloquant (app rouverte par la notification plein écran,
  // ou déjà ouverte quand l'alarme part).
  await WakeAlarm.addListener("alarmFired", (e) => {
    if (e.alarmId && e.alarmId !== "__test__") hooks.onNotificationTap(e.alarmId);
  });

  // Poll léger : couvre le cas où l'app est ouverte au moment du déclenchement
  // (le receiver a mémorisé le tir, le JS le consomme ici).
  setInterval(() => {
    void consumeFiredAlarm().then((id) => {
      if (id) hooks.onNotificationTap(id);
    });
  }, 5000);

  // Retour au premier plan : consomme un tir en attente + vérifie les alarmes manquées.
  await App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) return;
    void consumeFiredAlarm().then((id) => {
      if (id) hooks.onNotificationTap(id);
    });
    void checkMissed(alarmsRef.current, hooks, historyRef.current);
  });

  // Cold start via notification plein écran : le tir est déjà en SharedPreferences.
  void consumeFiredAlarm().then((id) => {
    if (id) hooks.onNotificationTap(id);
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
    if (!occ || now - occ.getTime() > MISSED_WINDOW_MS) continue;
    const done = history.some((h) => h.success && h.ts >= occ.getTime());
    if (!done) hooks.onMissedAlarm(a.id);
  }
}

/** Vérifie au lancement : alarme exacte + alarmes passées < 30 min + resync si nécessaire. */
export async function startupChecks(alarms: Alarm[], history: HistoryEntry[], hooks: NativeAlarmHooks) {
  if (!isNative()) return;
  setNativeAlarmsRef(alarms);
  const exact = await exactAlarmStatus();
  if (exact !== "granted") void openExactAlarmSettings();
  await checkMissed(alarms, hooks, history);

  // Filet de sécurité : compare les alarmes actives aux prochaines occurrences connues.
  const expected = new Set<string>();
  for (const a of alarms.filter((x) => x.enabled)) expected.add(a.id);
  const pending = await nativePending();
  const have = new Set(pending.map((p) => p.alarmId));
  if ([...expected].some((id) => !have.has(id))) await syncNativeAlarms(alarms);
}
