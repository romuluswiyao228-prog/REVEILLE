import type { HistoryEntry } from "./types";

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export interface Stats {
  current: number;
  best: number;
  weekReps: number;
  monthReps: number;
  rate: number; // 0..100
  total: number;
  pushupTotal: number;
  successDays: number;
  last7: { key: string; day: number; reps: number }[];
}

export function computeStats(history: HistoryEntry[], now = new Date()): Stats {
  const okDays = new Set(history.filter((h) => h.success).map((h) => h.date));
  const sorted = [...okDays].sort();

  // meilleure série
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of sorted) {
    const d = new Date(k + "T12:00:00");
    if (prev && dateKey(addDays(prev, 1)) === k) run++;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }

  // série actuelle (aujourd'hui ou hier comme point de départ)
  let cur = 0;
  let cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!okDays.has(dateKey(cursor))) cursor = addDays(cursor, -1);
  while (okDays.has(dateKey(cursor))) {
    cur++;
    cursor = addDays(cursor, -1);
  }

  const weekStart = dateKey(addDays(now, -6));
  const monthStart = dateKey(addDays(now, -29));
  let weekReps = 0;
  let monthReps = 0;
  let pushupTotal = 0;
  for (const h of history) {
    if (h.date >= weekStart) weekReps += h.reps;
    if (h.date >= monthStart) monthReps += h.reps;
    if (h.exercise === "pushup") pushupTotal += h.reps;
  }
  const final = history.filter((h) => h.method !== "postponed");
  const rate = final.length ? Math.round((final.filter((h) => h.success).length / final.length) * 100) : 0;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(now, i - 6);
    const key = dateKey(d);
    return {
      key,
      day: d.getDay(),
      reps: history.filter((h) => h.date === key).reduce((a, h) => a + h.reps, 0),
    };
  });

  return { current: cur, best, weekReps, monthReps, rate, total: history.length, pushupTotal, successDays: okDays.size, last7 };
}

export interface BadgeState {
  id: "b_week" | "b_7" | "b_30" | "b_100";
  icon: string;
  unlocked: boolean;
}

export function computeBadges(s: Stats): BadgeState[] {
  return [
    { id: "b_week", icon: "🌅", unlocked: s.successDays >= 7 },
    { id: "b_7", icon: "🔥", unlocked: s.best >= 7 },
    { id: "b_30", icon: "🏆", unlocked: s.best >= 30 },
    { id: "b_100", icon: "💪", unlocked: s.pushupTotal >= 100 },
  ];
}

/** Prochaine sonnerie d'une alarme (timestamp ms) ou null. */
export function nextRing(time: string, days: number[], now = new Date()): number | null {
  const [h, m] = time.split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const d = addDays(now, i);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    if (days.length === 0 || days.includes(d.getDay())) return d.getTime();
  }
  return null;
}

export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}
