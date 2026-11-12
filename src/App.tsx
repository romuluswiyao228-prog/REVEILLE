import { useCallback, useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "./lib/store";
import { Icon } from "./components/ui";
import InstallPrompt from "./components/InstallPrompt";
import Onboarding from "./screens/Onboarding";
import Home from "./screens/Home";
import AlarmEditor from "./screens/AlarmEditor";
import Ringing from "./screens/Ringing";
import BlockingAlarm from "./screens/BlockingAlarm";
import { clearActiveAlarm, loadActiveAlarm } from "./lib/activeAlarm";
import { getPoseLandmarker } from "./lib/poseDetector";
import Mission, { type MissionResult } from "./screens/Mission";
import Success, { type SuccessData } from "./screens/Success";
import History from "./screens/History";
import Stats from "./screens/Stats";
import Settings from "./screens/Settings";
import Paywall from "./screens/Paywall";
import Privacy from "./screens/Privacy";
import { stopAlarmSound } from "./lib/audio";
import { computeBadges, computeStats, dateKey } from "./lib/stats";
import type { HistoryEntry } from "./lib/types";
import { cn } from "./utils/cn";

type Tab = "home" | "history" | "stats" | "settings";
type Overlay =
  | { k: "editor"; id?: string }
  | { k: "paywall" }
  | { k: "privacy" }
  | { k: "ringing"; alarmId: string }
  | { k: "block"; alarmId: string }
  | { k: "mission"; alarmId: string }
  | { k: "success"; data: SuccessData };

function Shell() {
  const { t, alarms, history, settings, postponed, setPostponed, addHistory, setSettings, toggleAlarm } = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [onboarding, setOnboarding] = useState(!settings.onboarded);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const fired = useRef<string>("");
  const missionStart = useRef(0);

  // Planificateur (démo web : fonctionne tant que l'onglet est ouvert).
  // Dans l'app Flutter, c'est AlarmManager (Android) / notifications locales (iOS) qui prennent le relais.
  useEffect(() => {
    const tick = () => {
      const o = overlayRef.current;
      if (o && (o.k === "ringing" || o.k === "mission" || o.k === "success" || o.k === "block")) return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      if (postponed && now.getTime() >= postponed.at) {
        const id = postponed.alarmId;
        setPostponed(null);
        if (alarms.some((a) => a.id === id)) setOverlay({ k: "block", alarmId: id });
        return;
      }
      for (const a of alarms) {
        if (!a.enabled || a.time !== hhmm) continue;
        if (a.days.length > 0 && !a.days.includes(now.getDay())) continue;
        const key = `${a.id}-${dateKey(now)}-${hhmm}`;
        if (fired.current === key) continue;
        fired.current = key;
        if (a.days.length === 0) toggleAlarm(a.id);
        setOverlay({ k: "block", alarmId: a.id });
        return;
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [alarms, postponed, setPostponed, toggleAlarm]);

  // Restaure une alarme bloquante en cours après rechargement de la page.
  useEffect(() => {
    const a = loadActiveAlarm();
    if (!a || !settings.onboarded) return;
    const al = alarms.find((x) => x.id === a.alarmId);
    if (al) setOverlay({ k: "block", alarmId: al.id });
    else clearActiveAlarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => setOverlay(null), []);

  const startRinging = (alarmId: string) => setOverlay({ k: "ringing", alarmId });

  const snooze = (alarmId: string) => {
    stopAlarmSound();
    setSettings({ emergencySnoozeDate: dateKey(new Date()) });
    setPostponed({ alarmId, at: Date.now() + 5 * 60000, kind: "snooze" });
    setOverlay(null);
  };

  const postpone = (alarmId: string, reps: number, durationSec: number) => {
    stopAlarmSound();
    const a = alarms.find((x) => x.id === alarmId);
    if (a) {
      addHistory({ time: a.time, exercise: a.exercise, reps, target: a.reps, success: false, method: "postponed", durationSec });
    }
    setPostponed({ alarmId, at: Date.now() + 10 * 60000, kind: "problem" });
    setOverlay(null);
    setTab("home");
  };

  const complete = (alarmId: string, r: MissionResult) => {
    const a = alarms.find((x) => x.id === alarmId);
    if (!a) return setOverlay(null);
    const now = new Date();
    const entry: HistoryEntry = {
      id: "new",
      ts: now.getTime(),
      date: dateKey(now),
      time: a.time,
      exercise: a.exercise,
      reps: r.reps,
      target: a.reps,
      success: true,
      method: r.method,
      durationSec: r.durationSec,
    };
    const before = computeBadges(computeStats(history));
    const afterStats = computeStats([entry, ...history]);
    const after = computeBadges(afterStats);
    const newBadges = after.filter((b, i) => b.unlocked && !before[i].unlocked).map((b) => ({ id: b.id, icon: b.icon }));
    addHistory({ time: a.time, exercise: a.exercise, reps: r.reps, target: a.reps, success: true, method: r.method, durationSec: r.durationSec });
    setPostponed(null);
    setOverlay({ k: "success", data: { reps: r.reps, durationSec: r.durationSec, streak: afterStats.current, newBadges } });
  };

  if (onboarding) return <Onboarding onDone={() => setOnboarding(false)} />;

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "home", icon: "home", label: t("nav_home") },
    { id: "history", icon: "history", label: t("nav_history") },
    { id: "stats", icon: "chart", label: t("nav_stats") },
    { id: "settings", icon: "settings", label: t("nav_settings") },
  ];

  const ringingAlarm = overlay && (overlay.k === "ringing" || overlay.k === "mission") ? alarms.find((a) => a.id === overlay.alarmId) : undefined;
  const blockAlarm = overlay && overlay.k === "block" ? alarms.find((a) => a.id === overlay.alarmId) : undefined;

  const blockDone = (alarmId: string, reps: number, durationSec: number) => {
    const a = alarms.find((x) => x.id === alarmId);
    if (a) {
      addHistory({ time: a.time, exercise: a.exercise, reps, target: a.reps, success: true, method: "camera", durationSec });
    }
    setPostponed(null);
    setTab("home");
    close();
  };

  return (
    <div className="relative flex h-full flex-col">
      <main className="flex-1 overflow-y-auto">
        {tab === "home" && (
          <Home
            onAdd={() => setOverlay({ k: "editor" })}
            onEdit={(id) => setOverlay({ k: "editor", id })}
            onTest={startRinging}
            onPremium={() => setOverlay({ k: "paywall" })}
          />
        )}
        {tab === "history" && <History />}
        {tab === "stats" && <Stats />}
        {tab === "settings" && <Settings onPrivacy={() => setOverlay({ k: "privacy" })} onPremium={() => setOverlay({ k: "paywall" })} />}
      </main>

      <nav className="grid grid-cols-4 border-t border-[var(--line)] bg-[var(--card)] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-bold", tab === x.id ? "text-[var(--accent)]" : "text-[var(--muted)]")}
          >
            <Icon name={x.icon} />
            {x.label}
          </button>
        ))}
      </nav>

      {overlay && (
        <div className="slide-up absolute inset-0 z-30 overflow-y-auto bg-[var(--bg)]">
          {overlay.k === "editor" && <AlarmEditor id={overlay.id} onClose={close} onPremium={() => setOverlay({ k: "paywall" })} />}
          {overlay.k === "paywall" && <Paywall onClose={close} />}
          {overlay.k === "privacy" && <Privacy onClose={close} />}
          {overlay.k === "ringing" && ringingAlarm && (
            <Ringing
              alarm={ringingAlarm}
              onStart={() => {
                missionStart.current = Date.now();
                setOverlay({ k: "mission", alarmId: ringingAlarm.id });
              }}
              onSnooze={() => snooze(ringingAlarm.id)}
            />
          )}
          {overlay.k === "mission" && ringingAlarm && (
            <div className="relative min-h-full">
              <Mission
                alarm={ringingAlarm}
                onComplete={(r) => complete(ringingAlarm.id, r)}
                onPostpone={(reps, dur) => postpone(ringingAlarm.id, reps, dur)}
              />
            </div>
          )}
          {overlay.k === "success" && <Success data={overlay.data} onHome={() => { setTab("home"); close(); }} />}
          {overlay.k === "block" && blockAlarm && (
            <BlockingAlarm alarm={blockAlarm} onDone={(reps, dur) => blockDone(blockAlarm.id, reps, dur)} />
          )}
        </div>
      )}

      {!overlay && <InstallPrompt />}
    </div>
  );
}

export default function App() {
  // Précharge le modèle de pose ( WASM + .task locaux, précachés par le SW )
  // pour que la détection soit prête dès la première alarme.
  useEffect(() => {
    void getPoseLandmarker();
  }, []);

  return (
    <StoreProvider>
      <div className="flex h-full items-center justify-center md:bg-black/40 md:p-4">
        <div className="relative h-full w-full max-w-[430px] overflow-hidden bg-[var(--bg)] md:h-[min(100%,900px)] md:rounded-[2.5rem] md:border md:border-[var(--line)] md:shadow-2xl">
          <div className="h-full overflow-y-auto">
            <Shell />
          </div>
        </div>
      </div>
    </StoreProvider>
  );
}
