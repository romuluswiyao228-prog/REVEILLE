import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Alarm, HistoryEntry, Postponed, Settings } from "./types";
import { translate, type TKey } from "./i18n";
import { addDays, dateKey } from "./stats";

const KEY = "wakefit.v1";

interface Persisted {
  alarms: Alarm[];
  history: HistoryEntry[];
  settings: Settings;
  postponed: Postponed | null;
}

const defaultSettings: Settings = {
  lang: "fr",
  theme: "dark",
  volume: 0.8,
  sound: "sunrise",
  sensitivity: "normal",
  strict: true,
  allowSquats: true,
  premium: false,
  onboarded: false,
  cameraGranted: false,
  emergencySnoozeDate: "",
  problemDate: "",
  manualDate: "",
};

export const uid = () => Math.random().toString(36).slice(2, 10);

function seed(): Persisted {
  // Données de démonstration (une série en cours) pour que les statistiques soient parlantes.
  const history: HistoryEntry[] = [];
  const now = new Date();
  for (let i = 1; i <= 9; i++) {
    const d = addDays(now, -i);
    const skip = i === 11;
    if (skip) continue;
    const reps = 10 + (i % 3) * 2;
    history.push({
      id: uid(),
      ts: d.getTime(),
      date: dateKey(d),
      time: "07:00",
      exercise: "pushup",
      reps,
      target: reps,
      success: true,
      method: "camera",
      durationSec: 50 + i * 3,
    });
  }
  const d12 = addDays(now, -12);
  history.push({
    id: uid(),
    ts: d12.getTime(),
    date: dateKey(d12),
    time: "07:00",
    exercise: "pushup",
    reps: 4,
    target: 10,
    success: false,
    method: "postponed",
    durationSec: 30,
  });
  const alarms: Alarm[] = [
    {
      id: uid(),
      time: "07:00",
      days: [1, 2, 3, 4, 5],
      label: "Travail",
      sound: "sunrise",
      volume: 0.8,
      exercise: "pushup",
      reps: 10,
      difficulty: "normal",
      enabled: true,
    },
  ];
  return { alarms, history, settings: defaultSettings, postponed: null };
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      return { ...p, settings: { ...defaultSettings, ...p.settings } };
    }
  } catch {
    /* ignore */
  }
  return seed();
}

interface Ctx extends Persisted {
  t: (k: TKey, params?: Record<string, string | number>) => string;
  ringing: string | null;
  setRinging: (id: string | null) => void;
  saveAlarm: (a: Alarm) => void;
  removeAlarm: (id: string) => void;
  toggleAlarm: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addHistory: (h: Omit<HistoryEntry, "id" | "ts" | "date">) => void;
  setPostponed: (p: Postponed | null) => void;
  reset: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Persisted>(load);
  const [ringing, setRinging] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(data));
  }, [data]);

  const { lang, theme } = data.settings;
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    root.dataset.theme = theme;
  }, [lang, theme]);

  const t = useCallback((k: TKey, p?: Record<string, string | number>) => translate(lang, k, p), [lang]);

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      t,
      ringing,
      setRinging,
      saveAlarm: (a) =>
        setData((d) => ({
          ...d,
          alarms: d.alarms.some((x) => x.id === a.id) ? d.alarms.map((x) => (x.id === a.id ? a : x)) : [...d.alarms, a],
        })),
      removeAlarm: (id) => setData((d) => ({ ...d, alarms: d.alarms.filter((x) => x.id !== id) })),
      toggleAlarm: (id) =>
        setData((d) => ({ ...d, alarms: d.alarms.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) })),
      setSettings: (patch) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      addHistory: (h) =>
        setData((d) => {
          const now = new Date();
          return { ...d, history: [{ ...h, id: uid(), ts: now.getTime(), date: dateKey(now) }, ...d.history] };
        }),
      setPostponed: (p) => setData((d) => ({ ...d, postponed: p })),
      reset: () => {
        const s = seed();
        setData({ alarms: [], history: [], settings: { ...s.settings, ...data.settings }, postponed: null });
      },
    }),
    [data, t, ringing],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}
