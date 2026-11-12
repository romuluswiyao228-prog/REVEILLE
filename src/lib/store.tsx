import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Alarm, HistoryEntry, Postponed, Settings } from "./types";
import { translate, type TKey } from "./i18n";
import { dateKey } from "./stats";
import { clearCustomSounds, deleteCustomSound } from "./customSounds";

const KEY = "reveil:v2";
// Anciennes clés contenant des données de test / de démo : purgées au démarrage.
const LEGACY_KEYS = ["wakefit.v1"];

interface Profile {
  name: string;
}

interface Persisted {
  alarms: Alarm[];
  history: HistoryEntry[];
  settings: Settings;
  postponed: Postponed | null;
  profile: Profile;
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

/** État vierge : aucune donnée de démonstration. */
function empty(): Persisted {
  return { alarms: [], history: [], settings: { ...defaultSettings }, postponed: null, profile: { name: "" } };
}

function sanitize(p: Partial<Persisted>): Persisted {
  const e = empty();
  return {
    alarms: Array.isArray(p.alarms) ? p.alarms : e.alarms,
    history: Array.isArray(p.history) ? p.history : e.history,
    settings: { ...e.settings, ...(p.settings ?? {}) },
    postponed: p.postponed ?? null,
    profile: { name: typeof p.profile?.name === "string" ? p.profile.name : "" },
  };
}

function load(): Persisted {
  // Purge des anciennes clés (données de test / versions précédentes).
  for (const k of LEGACY_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitize(JSON.parse(raw) as Partial<Persisted>);
  } catch {
    /* ignore */
  }
  return empty();
}

interface Ctx extends Persisted {
  t: (k: TKey, params?: Record<string, string | number>) => string;
  ringing: string | null;
  setRinging: (id: string | null) => void;
  saveAlarm: (a: Alarm) => void;
  removeAlarm: (id: string) => void;
  toggleAlarm: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  addHistory: (h: Omit<HistoryEntry, "id" | "ts" | "date">) => void;
  setPostponed: (p: Postponed | null) => void;
  reset: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Persisted>(load);
  const [ringing, setRinging] = useState<string | null>(null);

  // Stockage durable si possible (données 100 % locales).
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {});
  }, []);

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
      removeAlarm: (id) => {
        void deleteCustomSound(id);
        setData((d) => ({ ...d, alarms: d.alarms.filter((x) => x.id !== id) }));
      },
      toggleAlarm: (id) =>
        setData((d) => ({ ...d, alarms: d.alarms.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) })),
      setSettings: (patch) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      setProfile: (patch) => setData((d) => ({ ...d, profile: { ...d.profile, ...patch } })),
      addHistory: (h) =>
        setData((d) => {
          const now = new Date();
          return { ...d, history: [{ ...h, id: uid(), ts: now.getTime(), date: dateKey(now) }, ...d.history] };
        }),
      setPostponed: (p) => setData((d) => ({ ...d, postponed: p })),
      reset: () => {
        void clearCustomSounds();
        setData((d) => ({
          ...empty(),
          // La langue et le thème sont conservés pour ne pas dérouter l'utilisateur.
          settings: { ...defaultSettings, lang: d.settings.lang, theme: d.settings.theme },
        }));
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
