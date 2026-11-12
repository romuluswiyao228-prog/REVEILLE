import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, ProgressRing } from "../components/ui";
import { useStore } from "../lib/store";
import { RepCounter, buildConfig, type Feedback, type PoseSample } from "../lib/repCounter";
import { synth, type SimMode, type Skeleton } from "../lib/poseSim";
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

const MANUAL_AFTER = 30;

const LINKS: [keyof Skeleton, keyof Skeleton][] = [
  ["shoulder", "elbow"],
  ["elbow", "wrist"],
  ["shoulder", "hip"],
  ["hip", "knee"],
  ["knee", "ankle"],
];

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
  const [feedback, setFeedback] = useState<Feedback>("out_of_frame");
  const [phase, setPhase] = useState<"unknown" | "up" | "down">("unknown");
  const [sk, setSk] = useState<Skeleton | null>(null);
  const [visible, setVisible] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<SimMode>("full");
  const [showProblem, setShowProblem] = useState(false);
  const [camState, setCamState] = useState<"off" | "on" | "error">("off");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const camStateRef = useRef(camState);
  camStateRef.current = camState;
  const detectorRef = useRef<PoseLandmarker | null>(null);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const elapsedRef = useRef(0);

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

  // Boucle de traitement (≈ 30 fps) : pose → angle → machine à états
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now();
    let lastVisible = true;
    const loop = () => {
      const t = performance.now() - t0;
      let sk: Skeleton | null;
      let sample: PoseSample;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (camStateRef.current === "on") {
        // Caméra active : vraie détection de pose, rien n'est compté sans personne détectée.
        const d =
          detector && video && video.readyState >= 2
            ? detectPose(detector, video, t, alarm.exercise)
            : null;
        sk = d?.sk ?? null;
        sample = d?.sample ?? { angle: 0, confidence: 0, aligned: false, t };
      } else {
        // Caméra non activée : simulateur de démo.
        const s = synth(t, alarm.exercise, modeRef.current);
        sk = s.sk;
        sample = s.sample;
      }
      const rep = counter.update(sample);
      setSk(sk);
      setFeedback(counter.feedback);
      setPhase(counter.phase);
      const vis = sample.confidence >= counter.cfg.minConfidence;
      if (vis !== lastVisible) {
        lastVisible = vis;
        setVisible(vis);
      }
      if (rep) {
        setCount(counter.count);
        playRepTick();
        // vibration progressive : plus on approche de la fin, plus elle est franche
        vibrate(25 + Math.round((counter.count / alarm.reps) * 150));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, counter, alarm.exercise, alarm.reps]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Fin de mission
  useEffect(() => {
    if (count >= target && !doneRef.current) {
      doneRef.current = true;
      setPlaying(false);
      setTimeout(() => onCompleteRef.current({ reps: target, method: "camera", durationSec: elapsedRef.current }), 700);
    }
  }, [count, target]);

  elapsedRef.current = elapsed;
  const manualLeft = Math.max(0, MANUAL_AFTER - elapsed);

  const confirmManual = () => {
    setSettings({ manualDate: today });
    doneRef.current = true;
    onComplete({ reps: target, method: "manual", durationSec: elapsed });
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const good = feedback === "good_rep" || feedback === "ready";
  const bad = feedback === "out_of_frame" || feedback === "bad_position";
  const fbColor = bad ? "var(--bad)" : feedback === "good_rep" ? "var(--ok)" : good ? "var(--fg)" : "var(--warn)";

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
        {/* repères du corps */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
          {sk && (
            <g opacity={visible ? 1 : 0.25} style={{ transition: "opacity .2s" }}>
              {LINKS.map(([a, b]) => (
                <line key={a + b} x1={sk[a].x} y1={sk[a].y} x2={sk[b].x} y2={sk[b].y} stroke={fbColor} strokeWidth={1.6} strokeLinecap="round" />
              ))}
              {(Object.keys(sk) as (keyof Skeleton)[]).map((k) => (
                <circle key={k} cx={sk[k].x} cy={sk[k].y} r={k === "elbow" || k === "knee" ? 2.4 : 1.8} fill={k === "elbow" || k === "knee" ? "var(--accent)" : "#fff"} />
              ))}
              <circle cx={sk.shoulder.x + (alarm.exercise === "pushup" ? 5 : 1)} cy={sk.shoulder.y - 5} r={4} fill="none" stroke={fbColor} strokeWidth={1.2} />
            </g>
          )}
        </svg>

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
          {t(`fb_${feedback}`)}
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
            <div className="text-4xl font-black text-[var(--accent)]">{phase === "down" ? "↓" : phase === "up" ? "↑" : "·"}</div>
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{phase === "down" ? t("phase_down") : phase === "up" ? t("phase_up") : "—"}</div>
          </div>
        </div>

        {/* contrôles de démo */}
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
