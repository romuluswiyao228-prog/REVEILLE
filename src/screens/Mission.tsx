import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, ProgressRing } from "../components/ui";
import { useStore } from "../lib/store";
import { RepCounter, buildConfig, type Feedback, type Phase } from "../lib/repCounter";
import { synth, type SimMode, type Skeleton } from "../lib/poseSim";
import { SkeletonLayer, paintSkeleton } from "../components/SkeletonOverlay";
import { detectPose, getPoseLandmarker } from "../lib/poseDetector";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { playRepTick, vibrate } from "../lib/audio";
import { dateKey } from "../lib/stats";
import type { Alarm } from "../lib/types";
import { cn } from "../utils/cn";

export interface MissionResult {
  reps: number;
  method: "camera" | "manual";
  durationSec: number;
}

interface UiState {
  feedback: Feedback;
  phase: Phase;
  visible: boolean;
}

const MANUAL_AFTER = 30;

function uiColor(feedback: Feedback): string {
  const bad = feedback === "out_of_frame" || feedback === "bad_position";
  if (bad) return "var(--bad)";
  if (feedback === "good_rep") return "var(--ok)";
  if (feedback === "ready") return "var(--fg)";
  return "var(--warn)";
}

export default function Mission({
  alarm,
  onComplete,
  onPostpone,
}: {
  alarm: Alarm;
  onComplete: (r: MissionResult) => void;
  onPostpone: (reps: number, durationSec: number) => void;
}) {
  const { t, settings, setSettings } = useStore();
  const today = dateKey(new Date());
  const problemAvailable = settings.problemDate !== today;
  const manualAvailable = settings.manualDate !== today;

  const counter = useMemo(
    () => new RepCounter(buildConfig(alarm.exercise, alarm.difficulty, settings.sensitivity, settings.strict)),
    [alarm.exercise, alarm.difficulty, settings.sensitivity, settings.strict],
  );

  const [count, setCount] = useState(0);
  const [ui, setUi] = useState<UiState>({ feedback: "out_of_frame", phase: "unknown", visible: true });
  const uiRef = useRef(ui);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<SimMode>("full");
  const [showProblem, setShowProblem] = useState(false);
  const [summary, setSummary] = useState(false);
  const [camState, setCamState] = useState<"off" | "on" | "error">("off");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const camStateRef = useRef(camState);
  camStateRef.current = camState;
  const detectorRef = useRef<PoseLandmarker | null>(null);
  const skelG = useRef<SVGGElement>(null);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const elapsedRef = useRef(0);
  const summaryTimer = useRef<number | null>(null);
  const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
  const [dbg, setDbg] = useState({ fps: 0, angle: 0, phase: "-", side: "-", lock: false });

  const target = alarm.reps;
  const remaining = Math.max(0, target - count);
  const progress = count / target;

  // Caméra frontale — demandée uniquement ici (au moment nécessaire), flux jamais enregistré.
  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
      setCamState("on");
      setPlaying(true);
      setSettings({ cameraGranted: true });
    } catch {
      setCamState("error");
    }
  }, [setSettings]);

  useEffect(() => {
    if (settings.cameraGranted) void startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chargement du modèle de pose (WASM + .task servis en local).
  useEffect(() => {
    let alive = true;
    void getPoseLandmarker().then((l) => {
      if (alive) detectorRef.current = l;
    });
    return () => {
      alive = false;
    };
  }, []);

  // Met à jour l'état React uniquement quand quelque chose change vraiment.
  const pushUi = (feedback: Feedback, phase: Phase, visible: boolean) => {
    const cur = uiRef.current;
    if (cur.feedback === feedback && cur.phase === phase && cur.visible === visible) return;
    const next = { feedback, phase, visible };
    uiRef.current = next;
    setUi(next);
  };

  // Boucle de traitement : une itération par NOUVELLE frame vidéo.
  // Le squelette est peint en DOM impératif ; React n'est re-rendu que
  // quand feedback/phase/visibilité changent réellement.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastVT = -1;
    let frames = 0;
    let fpsT0 = performance.now();
    let fps = 0;
    let dbgT = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      frames++;
      if (now - fpsT0 >= 500) {
        fps = Math.round((frames * 1000) / (now - fpsT0));
        frames = 0;
        fpsT0 = now;
      }
      const t = now;
      const video = videoRef.current;
      const detector = detectorRef.current;
      const camOn = camStateRef.current === "on";
      let rep = false;
      let vis = false;
      let angle = 0;
      let sideUsed = "-";

      if (camOn) {
        // Caméra active : vraie détection, une itération par frame vidéo nouvelle.
        if (!video || video.readyState < 2 || video.currentTime === lastVT) {
          if (DEBUG && now - dbgT > 200) {
            dbgT = now;
            setDbg({ fps, angle: 0, phase: counter.phase, side: "-", lock: counter.locked });
          }
          return;
        }
        lastVT = video.currentTime;
        const d = detector ? detectPose(detector, video, t, alarm.exercise) : null;
        const skel: Skeleton | null = d?.sk ?? null;
        vis = d ? d.sample.confidence >= counter.cfg.minConfidence : false;
        if (d) {
          angle = d.sample.angle;
          sideUsed = d.side;
        }
        paintSkeleton(skelG.current, skel, uiColor(counter.feedback), vis ? 1 : 0.25);
        rep = counter.update(d ? d.sample : null, t);
      } else {
        // Caméra non activée : simulateur de démo.
        const s = synth(t, alarm.exercise, modeRef.current);
        paintSkeleton(skelG.current, s.sk, uiColor(counter.feedback), 1);
        angle = s.sample.angle;
        vis = true;
        rep = counter.update(s.sample, t);
      }

      if (rep) {
        setCount(counter.count);
        playRepTick();
        // vibration progressive : plus on approche de la fin, plus elle est franche
        vibrate(25 + Math.round((counter.count / alarm.reps) * 150));
      }
      pushUi(counter.feedback, counter.phase, vis);
      if (DEBUG && now - dbgT > 200) {
        dbgT = now;
        setDbg({ fps, angle: Math.round(angle), phase: counter.phase, side: sideUsed, lock: counter.locked });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, counter, alarm.exercise, alarm.reps]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Fin de série : résumé + Refaire ; la mission se valide seule après quelques secondes.
  useEffect(() => {
    if (count >= target && !doneRef.current) {
      doneRef.current = true;
      setPlaying(false);
      setSummary(true);
      summaryTimer.current = window.setTimeout(
        () => onCompleteRef.current({ reps: target, method: "camera", durationSec: elapsedRef.current }),
        10000,
      );
    }
    return () => {
      if (summaryTimer.current) {
        clearTimeout(summaryTimer.current);
        summaryTimer.current = null;
      }
    };
  }, [count, target]);

  const redo = () => {
    if (summaryTimer.current) {
      clearTimeout(summaryTimer.current);
      summaryTimer.current = null;
    }
    doneRef.current = false;
    counter.reset();
    setCount(0);
    setElapsed(0);
    setSummary(false);
    setPlaying(true);
  };

  elapsedRef.current = elapsed;
  const manualLeft = Math.max(0, MANUAL_AFTER - elapsed);

  const confirmManual = () => {
    setSettings({ manualDate: today });
    doneRef.current = true;
    onComplete({ reps: target, method: "manual", durationSec: elapsed });
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const good = ui.feedback === "good_rep" || ui.feedback === "ready";
  const bad = ui.feedback === "out_of_frame" || ui.feedback === "bad_position";
  const fbColor = bad ? "var(--bad)" : ui.feedback === "good_rep" ? "var(--ok)" : good ? "var(--fg)" : "var(--warn)";
  const fbKey = ui.feedback === "get_in_position" ? (alarm.exercise === "squat" ? "fb_squatPos" : "fb_pushupPos") : (`fb_${ui.feedback}` as const);

  return (
    <div className="flex min-h-full flex-col">
      {/* barre haute */}
      <div className="flex items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <span>{alarm.exercise === "pushup" ? "💪" : "🦵"}</span>
          {t(alarm.exercise)}
        </div>
        <div className="tnum rounded-full bg-[var(--card)] px-4 py-1.5 text-lg font-extrabold border border-[var(--line)]" dir="ltr">
          ⏱ {mm}:{ss}
        </div>
      </div>

      {/* zone caméra */}
      <div className="relative mx-4 h-[34vh] min-h-48 overflow-hidden rounded-3xl border border-[var(--line)] bg-[#05070b]">
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
        {/* repères du corps : peinture impérative, pas de re-render par frame */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
          <SkeletonLayer ref={skelG} />
        </svg>

        {DEBUG && (
          <div className="absolute left-3 top-3 z-10 rounded-lg bg-black/70 px-2 py-1 font-mono text-[10px] font-bold text-[var(--ok)]">
            {dbg.fps}fps · {alarm.exercise} · {dbg.angle}° · {dbg.phase} · {dbg.side} · lock {dbg.lock ? "yes" : "no"}
          </div>
        )}

        <div className="absolute start-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-white">
          <span className={cn("h-2 w-2 rounded-full", camState === "on" ? "bg-[var(--ok)]" : "bg-[var(--warn)]")} />
          {camState === "on" ? t("camOn") : t("demoBadge")}
        </div>
        {camState !== "on" && (
          <button onClick={startCamera} className="absolute end-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-bold text-black">
            <Icon name="camera" size={14} /> {t("tryCamera")}
          </button>
        )}
        {camState === "error" && <div className="absolute inset-x-0 top-12 text-center text-xs font-semibold text-[var(--warn)]">{t("camOff")}</div>}

        {/* message temps réel */}
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 px-4 py-3 text-center text-xl font-extrabold backdrop-blur" style={{ color: fbColor }} role="status" aria-live="polite">
          {t(fbKey)}
        </div>
      </div>

      {/* compteur central */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-4">
        <div className="flex w-full items-center justify-between">
          <div className="w-24 text-center">
            <div className="tnum text-4xl font-black">{remaining}</div>
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("remaining")}</div>
          </div>
          <ProgressRing value={progress} size={200} stroke={16} color={count >= target ? "var(--ok)" : "var(--accent)"}>
            <div key={count} className="tnum pop text-8xl font-black leading-none">
              {count}
            </div>
            <div className="mt-1 text-sm font-bold text-[var(--muted)]">
              {t("of")} {target}
            </div>
          </ProgressRing>
          <div className="w-24 text-center">
            <div className="text-4xl font-black text-[var(--accent)]">{ui.phase === "down" ? "↓" : ui.phase === "up" ? "↑" : "·"}</div>
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{ui.phase === "down" ? t("phase_down") : ui.phase === "up" ? t("phase_up") : "—"}</div>
          </div>
        </div>

        {/* résumé de fin de série ou contrôles de démo */}
        {summary ? (
          <div className="slide-up w-full space-y-3 rounded-3xl border border-[var(--ok)] bg-[var(--card)] p-5 text-center">
            <div className="text-2xl font-black text-[var(--ok)]">{t("seriesDone")}</div>
            <div className="text-base font-bold">
              {alarm.exercise === "pushup" ? "💪" : "🦵"} {t(alarm.exercise)} · {count} {t("repsUnit")}
            </div>
            <div className="tnum text-sm font-bold text-[var(--muted)]" dir="ltr">
              ⏱ {mm}:{ss}
            </div>
            <Button variant="ghost" className="w-full" onClick={redo}>
              <Icon name="play" size={18} /> {t("redo")}
            </Button>
          </div>
        ) : (
        <div className="w-full rounded-2xl border border-dashed border-[var(--line)] p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            <span>{t("demoMovement")}</span>
            <button onClick={() => setPlaying((p) => !p)} className="flex items-center gap-1 rounded-full bg-[var(--card2)] px-3 py-1 text-[var(--fg)]">
              <Icon name={playing ? "pause" : "play"} size={14} /> {playing ? t("demoPause") : t("demoPlay")}
            </button>
          </div>
          <div className="flex gap-1.5">
            {(["full", "partial", "out"] as SimMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "min-h-10 flex-1 rounded-xl text-xs font-bold",
                  mode === m ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "bg-[var(--card2)] text-[var(--muted)]",
                )}
              >
                {t(m === "full" ? "demoFull" : m === "partial" ? "demoPartial" : "demoOut")}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">{t("demoNote")}</p>
        </div>
        )}
      </div>

      {/* actions de secours */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" className="!min-h-14 text-sm" disabled={!manualAvailable || manualLeft > 0} onClick={confirmManual}>
          {!manualAvailable ? t("manualUsed") : manualLeft > 0 ? t("manualWait", { s: manualLeft }) : t("manual")}
        </Button>
        <Button variant="danger" className="!min-h-14 text-sm" disabled={!problemAvailable} onClick={() => setShowProblem(true)}>
          <Icon name="warn" size={18} /> {problemAvailable ? t("problem") : t("problemUsed")}
        </Button>
      </div>

      {showProblem && (
        <div className="absolute inset-0 z-20 flex items-end bg-black/70 p-4 backdrop-blur-sm">
          <div className="slide-up w-full space-y-4 rounded-3xl bg-[var(--card)] p-6">
            <div className="text-2xl font-black">{t("problemTitle")}</div>
            <p className="text-[var(--muted)]">{t("problemDesc")}</p>
            <Button
              onClick={() => {
                setSettings({ problemDate: today });
                onPostpone(counter.count, elapsed);
              }}
            >
              {t("problemConfirm")}
            </Button>
            <Button variant="ghost" onClick={() => setShowProblem(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
