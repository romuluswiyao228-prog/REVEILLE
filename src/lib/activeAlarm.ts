// État « alarme bloquante en cours » : survit au rechargement de la page.
const KEY = "wakefit.blocking.v1";

export interface ActiveAlarm {
  alarmId: string;
  repsDone: number;
  startedAt: number;
}

export function loadActiveAlarm(): ActiveAlarm | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as ActiveAlarm;
    if (!a || typeof a.alarmId !== "string") return null;
    return a;
  } catch {
    return null;
  }
}

export function saveActiveAlarm(a: ActiveAlarm) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
}

export function clearActiveAlarm() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
