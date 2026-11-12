import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, ProgressRing } from "../components/ui";
import { SkeletonLayer, paintSkeleton } from "../components/SkeletonOverlay";
import { useStore } from "../lib/store";
import { RepCounter, buildConfig, type Feedback } from "../lib/repCounter";
import type { Skeleton } from "../lib/poseSim";
import { detectPose, getPoseLandmarker } from "../lib/poseDetector";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { audioRunning, startAlarmSound, stopAlarmSound, vibrate, playRepTick } from "../lib/audio";
import { clearActiveAlarm, loadActiveAlarm, saveActiveAlarm } from "../lib/activeAlarm";
import type { Alarm } from "../lib/types";
import { cn } from "../utils/cn";

type Phase = "unknown" | "up" | "down";

interface UiState {
  feedback: Feedback;
  phase: Phase;
  visible: boolean;
}

const CAM_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } },
  audio: false,
};

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
  const [ui, setUi] = useState<UiState>({ feedback: "out_of_frame", phase: "unknown", visible: true });
  const uiRef = useRef(ui);
  const [elapsed, setElapsed] = useState(0);
  const [camState, setCamState] = useState<"on" | "error">("on");
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
  const [dbg, setDbg] = useState({ fps: 0, angle: 0, phase: "-", side: "-", lock: false });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<PoseLandmarker | null>(null);
  const skelG = useRef<SVGGElement>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const doneRef = useRef(false);
  const elapsedRef = useRef(0);
  const camStateRef = useRef(camState);
  camStateRef.current = camState;
  const lastVideoTime = useRef(-1);

  const target = alarm.reps;
  const remaining = Math.max(0, target - count);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia(CAM_CONSTRAINTS);
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

  // Sonnerie en boucle à volume max + vibration + état persisté.
  // Caméra et modèle de pose chargés en parallèle, avec préchauffage par une
  // inférence à blanc dès que les deux sont prêts.
  useEffect(() => {
    startAlarmSound(alarm.sound, 1);
    const check = setTimeout(() => setBlocked(!audioRunning()), 400);
    const clock = setInterval(() => setElapsed((e) => e + 1), 1000);
    const vib = setInterval(() => vibrate([400, 200, 400]), 1500);
    saveActiveAlarm({ alarmId: alarm.id, repsDone: initialReps, startedAt: startedAt.current });
    void Promise.all([
      startCamera(),
      getPoseLandmarker().then((l) => {
        detectorRef.current = l;
      }),
    ]).then(() => {
      const v = videoRef.current;
      const d = detectorRef.current;
      if (v && v.readyState >= 2 && d) {
        try {
          d.detectForVideo(v, performance.now());
        } catch {
          /* préchauffage best-effort */
        }
      }
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

  // Met à jour l'état React uniquement quand quelque chose change vraiment.
  const pushUi = (feedback: Feedback, phase: Phase, visible: boolean) => {
    const cur = uiRef.current;
    if (cur.feedback === feedback && cur.phase === phase && cur.visible === visible) return;
    const next = { feedback, phase, visible };
    uiRef.current = next;
    setUi(next);
  };

  // Détection + comptage : une itération par NOUVELLE frame vidéo.
  // Le squelette est peint en DOM impératif ; React n'est re-rendu que
  // quand feedback/phase/visibilité changent réellement.
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let fpsT0 = performance.now();
    let fps = 0;
    let dbgT = 0;
    const loop = () => {
      if (doneRef.current) return;
      const now = performance.now();
      // Timestamp absolu et monotone : detectForVideo l'exige (warm-up inclus).
      const t = now;
      frames++;
      if (now - fpsT0 >= 500) {
        fps = Math.round((frames * 1000) / (now - fpsT0));
        frames = 0;
        fpsT0 = now;
      }
      raf = requestAnimationFrame(loop);

      const video = videoRef.current;
      const detector = detectorRef.current;
      // Ne traite que les frames réellement nouvelles.
      if (!video || video.readyState < 2 || video.currentTime === lastVideoTime.current) return;
      lastVideoTime.current = video.currentTime;

      let skel: Skeleton | null = null;
      let sideUsed = "-";
      let angle = 0;
      if (camStateRef.current === "on" && detector) {
        const d = detectPose(detector, video, t, alarm.exercise);
        if (d) {
          skel = d.sk;
          sideUsed = d.side;
          angle = d.sample.angle;
          const rep = counter.update(d.sample, t);
          paintSkeleton(skelG.current, skel, uiColor(counter.feedback), d.sample.confidence >= counter.cfg.minConfidence ? 1 : 0.25);
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
          pushUi(counter.feedback, counter.phase, d.sample.confidence >= counter.cfg.minConfidence);
        } else {
          paintSkeleton(skelG.current, null, "", 0);
          counter.update(null, t);
          pushUi(counter.feedback, counter.phase, false);
        }
      } else {
        // Caméra pas encore active : état vide, rien n'est compté.
        paintSkeleton(skelG.current, null, "", 0);
        counter.update(null, t);
        pushUi(counter.feedback, counter.phase, false);
      }
      // Debug : setState throttlé (~5/s), pas à chaque frame.
      if (DEBUG && now - dbgT > 200) {
        dbgT = now;
        setDbg({ fps, angle: Math.round(angle), phase: counter.phase, side: sideUsed, lock: counter.locked });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counter, alarm.exercise, alarm.id, target]);

  const enableSound = () => {
    startAlarmSound(alarm.sound, 1);
    setBlocked(false);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const good = ui.feedback === "good_rep" || ui.feedback === "ready";
  const bad = ui.feedback === "out_of_frame" || ui.feedback === "bad_position";
  const fbColor = bad ? "var(--bad)" : ui.feedback === "good_rep" ? "var(--ok)" : good ? "var(--fg)" : "var(--warn)";

  if (done) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center gap-6 bg-[var(--bg)] px-6 text-center">
        <div className="pulse-ring flex h-28 w-28 items-center justify-center rounded-full bg-[var(--ok)] text-[var(--accent-fg)]">
          <Icon name="check" size={56} />
        </div>
        <div className="text-4xl font-black text-[var(--fg)]">{t("blockDoneTitle")}</div>
        <div className="text-lg font-bold text-[var(--muted)]">
          {alarm.exercise === "pushup" ? "💪" : "🦵"} {t(alarm.exercise)} · {target} {t("repsUnit")}
        </div>
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
          <SkeletonLayer ref={skelG} />
        </svg>

        {DEBUG && (
          <div className="absolute left-3 top-3 z-10 rounded-lg bg-black/70 px-2 py-1 font-mono text-[10px] font-bold text-[var(--ok)]">
            {dbg.fps}fps · {alarm.exercise} · {dbg.angle}° · {dbg.phase} · {dbg.side} · lock {dbg.lock ? "yes" : "no"}
          </div>
        )}
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
          {t(ui.feedback === "get_in_position" ? (alarm.exercise === "squat" ? "fb_squatPos" : "fb_pushupPos") : `fb_${ui.feedback}`)}
        </div>
      </div>
      <p className="relative px-6 pt-2 text-center text-[11px] font-semibold text-[var(--muted)]">{t("poseTip")}</p>

      {/* compteur central */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-5 py-4">
        <div key={remaining} className="pop text-center">
          <div className="text-sm font-bold uppercase tracking-widest text-[var(--muted)]">
            {t("blockRepsLeftAny", { e: t(alarm.exercise), x: remaining, n: target })}
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

function uiColor(feedback: Feedback): string {
  const bad = feedback === "out_of_frame" || feedback === "bad_position";
  if (bad) return "var(--bad)";
  if (feedback === "good_rep") return "var(--ok)";
  if (feedback === "ready") return "var(--fg)";
  return "var(--warn)";
}
