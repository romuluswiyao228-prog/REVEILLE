import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, ProgressRing } from "../components/ui";
import { useStore } from "../lib/store";
import { RepCounter, buildConfig, type Feedback, type PoseSample } from "../lib/repCounter";
import type { Skeleton } from "../lib/poseSim";
import { detectPose, getPoseLandmarker } from "../lib/poseDetector";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { audioRunning, startAlarmSound, stopAlarmSound, vibrate, playRepTick } from "../lib/audio";
import { clearActiveAlarm, loadActiveAlarm, saveActiveAlarm } from "../lib/activeAlarm";
import type { Alarm } from "../lib/types";
import { cn } from "../utils/cn";

const LINKS: [keyof Skeleton, keyof Skeleton][] = [
  ["shoulder", "elbow"],
  ["elbow", "wrist"],
  ["shoulder", "hip"],
  ["hip", "knee"],
  ["knee", "ankle"],
];

export default function BlockingAlarm({ alarm, onDone }: { alarm: Alarm; onDone: (reps: number, durationSec: number) => void }) {
  const { t, settings } = useStore();
  const [initial] = useState(() => loadActiveAlarm());
  const startedAt = useRef(initial?.startedAt ?? Date.now());
  const initialReps = Math.min(initial?.repsDone ?? 0, alarm.reps);

  const counter = useMemo(() => {
    const c = new RepCounter(buildConfig(alarm.exercise, alarm.difficulty, settings.sensitivity, settings.strict));
    c.count = initialReps;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarm.exercise, alarm.difficulty, settings.sensitivity, settings.strict]);

  const [count, setCount] = useState(initialReps);
  const [feedback, setFeedback] = useState<Feedback>("out_of_frame");
  const [sk, setSk] = useState<Skeleton | null>(null);
  const [visible, setVisible] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [camState, setCamState] = useState<"on" | "error">("on");
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<PoseLandmarker | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const doneRef = useRef(false);
  const elapsedRef = useRef(0);

  const target = alarm.reps;
  const remaining = Math.max(0, target - count);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
      setCamState("on");
    } catch {
      setCamState("error");
    }
  }, []);

  // Sonnerie en boucle à volume max + vibration + état persisté
  useEffect(() => {
    startAlarmSound(alarm.sound, 1);
    const check = setTimeout(() => setBlocked(!audioRunning()), 400);
    const clock = setInterval(() => setElapsed((e) => e + 1), 1000);
    const vib = setInterval(() => vibrate([400, 200, 400]), 1500);
    saveActiveAlarm({ alarmId: alarm.id, repsDone: initialReps, startedAt: startedAt.current });
    void startCamera();
    void getPoseLandmarker().then((l) => {
      detectorRef.current = l;
    });
    return () => {
      clearTimeout(check);
      clearInterval(clock);
      clearInterval(vib);
      if (!doneRef.current) stopAlarmSound();
      stopCamera();
      void wakeLockRef.current?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wake Lock : garder l'écran allumé pendant l'alarme
  useEffect(() => {
    const request = async () => {
      try {
        const wl = await (navigator as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen");
        wakeLockRef.current = wl ?? null;
      } catch {
        /* non supporté */
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Bloque la navigation arrière
  useEffect(() => {
    history.pushState(null, "", location.href);
    const guard = () => history.pushState(null, "", location.href);
    window.addEventListener("popstate", guard);
    return () => window.removeEventListener("popstate", guard);
  }, []);

  elapsedRef.current = elapsed;

  // Détection + comptage : uniquement de la vraie pose (caméra), jamais le simulateur.
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    let lastVisible = true;
    const loop = () => {
      if (doneRef.current) return;
      const t = performance.now() - t0;
      const video = videoRef.current;
      const detector = detectorRef.current;
      let skel: Skeleton | null = null;
      const sample: PoseSample = { angle: 0, confidence: 0, aligned: false, t };
      if (camState === "on" && detector && video && video.readyState >= 2) {
        const d = detectPose(detector, video, t, alarm.exercise);
        if (d) {
          skel = d.sk;
          Object.assign(sample, d.sample);
        }
      }
      const rep = counter.update(sample);
      setSk(skel);
      setFeedback(counter.feedback);
      const vis = sample.confidence >= counter.cfg.minConfidence;
      if (vis !== lastVisible) {
        lastVisible = vis;
        setVisible(vis);
      }
      if (rep) {
        setCount(counter.count);
        saveActiveAlarm({ alarmId: alarm.id, repsDone: counter.count, startedAt: startedAt.current });
        playRepTick();
        vibrate(25 + Math.round((counter.count / target) * 150));
        if (counter.count >= target) {
          doneRef.current = true;
          stopAlarmSound();
          stopCamera();
          clearActiveAlarm();
          void wakeLockRef.current?.release().catch(() => {});
          setDone(true);
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counter, camState, alarm.exercise, alarm.id, target]);

  const enableSound = () => {
    startAlarmSound(alarm.sound, 1);
    setBlocked(false);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const good = feedback === "good_rep" || feedback === "ready";
  const bad = feedback === "out_of_frame" || feedback === "bad_position";
  const fbColor = bad ? "var(--bad)" : feedback === "good_rep" ? "var(--ok)" : good ? "var(--fg)" : "var(--warn)";

  if (done) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center gap-6 bg-[var(--bg)] px-6 text-center">
        <div className="pulse-ring flex h-28 w-28 items-center justify-center rounded-full bg-[var(--ok)] text-[var(--accent-fg)]">
          <Icon name="check" size={56} />
        </div>
        <div className="text-4xl font-black text-[var(--fg)]">{t("blockDoneTitle")}</div>
        <div className="tnum text-lg font-bold text-[var(--muted)]" dir="ltr">
          {mm}:{ss}
        </div>
        <Button className="mt-4 w-full max-w-xs" onClick={() => onDone(target, elapsedRef.current)}>
          {t("blockHome")}
        </Button>
      </div>
    );
  }

  return (
    <div
      onClick={blocked ? enableSound : undefined}
      className="relative flex min-h-full flex-col bg-[var(--bg)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_65%)]" />

      {/* haut : label + temps */}
      <div className="relative flex items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <span className="ring-shake inline-block">🔔</span>
          {alarm.label || "WakeFit"}
        </div>
        <div className="tnum rounded-full bg-[var(--card)] px-4 py-1.5 text-lg font-extrabold border border-[var(--line)]" dir="ltr">
          ⏱ {mm}:{ss}
        </div>
      </div>

      {/* zone caméra */}
      <div className="relative mx-4 h-[30vh] min-h-44 overflow-hidden rounded-3xl border border-[var(--line)] bg-[#05070b]">
        <video ref={videoRef} playsInline muted className={cn("absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-60", camState !== "on" && "hidden")} />
        {camState !== "on" && (
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
        )}
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
          {sk && (
            <g opacity={visible ? 1 : 0.25} style={{ transition: "opacity .2s" }}>
              {LINKS.map(([a, b]) => (
                <line key={a + b} x1={sk[a].x} y1={sk[a].y} x2={sk[b].x} y2={sk[b].y} stroke={fbColor} strokeWidth={1.6} strokeLinecap="round" />
              ))}
              {(Object.keys(sk) as (keyof Skeleton)[]).map((k) => (
                <circle key={k} cx={sk[k].x} cy={sk[k].y} r={k === "elbow" || k === "knee" ? 2.4 : 1.8} fill={k === "elbow" || k === "knee" ? "var(--accent)" : "#fff"} />
              ))}
            </g>
          )}
        </svg>

        {blocked && (
          <div className="absolute inset-x-3 top-3 rounded-2xl bg-[var(--warn)]/90 px-3 py-2 text-center text-sm font-bold text-black">
            🔇 {t("soundBlocked")}
          </div>
        )}
        {camState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 text-center">
            <div className="text-sm font-bold text-[var(--warn)]">{t("camOff")}</div>
            <button onClick={(e) => { e.stopPropagation(); void startCamera(); }} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-fg)]">
              {t("tryCamera")}
            </button>
          </div>
        )}

        {/* message temps réel */}
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 px-4 py-2.5 text-center text-lg font-extrabold backdrop-blur" style={{ color: fbColor }} role="status" aria-live="polite">
          {t(`fb_${feedback}`)}
        </div>
      </div>

      {/* compteur central */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-5 py-4">
        <div key={remaining} className="pop text-center">
          <div className="text-sm font-bold uppercase tracking-widest text-[var(--muted)]">
            {t("blockRepsLeft", { x: remaining, n: target })}
          </div>
        </div>
        <ProgressRing value={count / target} size={180} stroke={14} color={count >= target ? "var(--ok)" : "var(--accent)"}>
          <div className="tnum text-7xl font-black leading-none">{remaining}</div>
          <div className="mt-1 text-xs font-bold text-[var(--muted)]">
            {t("of")} {target}
          </div>
        </ProgressRing>
        <p className="text-xs font-semibold text-[var(--muted)]">{t("noDismiss")}</p>
      </div>
    </div>
  );
}
