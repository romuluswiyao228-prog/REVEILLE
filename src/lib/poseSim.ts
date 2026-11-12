// Générateur de pose synthétique (vue de profil) pour la démo web.
// Calcule le squelette par cinématique inverse à 2 segments, puis l'angle articulaire réel
// à partir des repères — comme le ferait le vrai détecteur de pose.
import type { Exercise, PoseSample } from "./repCounter";

export interface P {
  x: number;
  y: number;
}
export interface Skeleton {
  shoulder: P;
  elbow: P;
  wrist: P;
  hip: P;
  knee: P;
  ankle: P;
}

export type SimMode = "full" | "partial" | "out";

function sub(a: P, b: P): P {
  return { x: a.x - b.x, y: a.y - b.y };
}
function len(a: P) {
  return Math.hypot(a.x, a.y);
}
export function angleAt(a: P, b: P, c: P): number {
  const v1 = sub(a, b);
  const v2 = sub(c, b);
  const cos = (v1.x * v2.x + v1.y * v2.y) / (len(v1) * len(v2) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Point du coude/genou : à distance l de a et de c, côté `side` (±1). */
function joint(a: P, c: P, l: number, side: 1 | -1): P {
  const d = len(sub(c, a));
  const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  const h = Math.sqrt(Math.max(0, l * l - (d / 2) * (d / 2)));
  const nx = -(c.y - a.y) / (d || 1);
  const ny = (c.x - a.x) / (d || 1);
  return { x: m.x + nx * h * side, y: m.y + ny * h * side };
}

/** phase 0..1 → 0 (haut) … 1 (bas) … 0 */
function wave(phase: number) {
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

export function synth(t: number, exercise: Exercise, mode: SimMode, periodMs = 2600): { sk: Skeleton; sample: PoseSample } {
  const phase = (t % periodMs) / periodMs;
  const depth = mode === "partial" ? 0.45 : 1;
  const k = wave(phase) * depth;
  let sk: Skeleton;

  if (exercise === "pushup") {
    const l = 17;
    const theta = 172 - k * (172 - 68); // angle du coude
    const d = 2 * l * Math.sin(((theta / 2) * Math.PI) / 180);
    const wrist = { x: 74, y: 78 };
    const dx = 0.9 * l;
    const h = Math.sqrt(Math.max(1, d * d - dx * dx));
    const shoulder = { x: wrist.x - dx, y: wrist.y - h };
    const elbow = joint(shoulder, wrist, l, -1); // coude vers l'arrière/haut
    const body = 62;
    const ankleX = shoulder.x - Math.sqrt(Math.max(1, body * body - (78 - shoulder.y) ** 2));
    const ankle = { x: ankleX, y: 80 };
    const hip = { x: shoulder.x + (ankle.x - shoulder.x) * 0.55, y: shoulder.y + (ankle.y - shoulder.y) * 0.55 };
    const knee = { x: shoulder.x + (ankle.x - shoulder.x) * 0.78, y: shoulder.y + (ankle.y - shoulder.y) * 0.78 };
    sk = { shoulder, elbow, wrist, hip, knee, ankle };
  } else {
    const l = 24;
    const theta = 174 - k * (174 - 70);
    const d = 2 * l * Math.sin(((theta / 2) * Math.PI) / 180);
    const ankle = { x: 55, y: 90 };
    const dx = 0.35 * l;
    const h = Math.sqrt(Math.max(1, d * d - dx * dx));
    const hip = { x: ankle.x - dx, y: ankle.y - h };
    const knee = joint(hip, ankle, l, 1);
    const trunk = 30;
    const lean = 0.15 + k * 0.45;
    const shoulder = { x: hip.x + trunk * Math.sin(lean), y: hip.y - trunk * Math.cos(lean) };
    const wrist = { x: shoulder.x + 22, y: shoulder.y + 2 + k * 4 };
    const elbow = { x: (shoulder.x + wrist.x) / 2, y: (shoulder.y + wrist.y) / 2 + 3 };
    sk = { shoulder, elbow, wrist, hip, knee, ankle };
  }

  const out = mode === "out";
  const angle = exercise === "pushup" ? angleAt(sk.shoulder, sk.elbow, sk.wrist) : angleAt(sk.hip, sk.knee, sk.ankle);
  // alignement
  let aligned: boolean;
  if (exercise === "pushup") {
    const dy = Math.abs(sk.shoulder.y - sk.hip.y);
    const dxx = Math.abs(sk.shoulder.x - sk.hip.x);
    aligned = dy < dxx * 0.6;
  } else {
    aligned = true;
  }
  // Confiance par point clé : hors cadre -> tout est faible, sinon fiable.
  const kp = out ? 0.15 : 0.92;
  const keypoints: Record<string, number> =
    exercise === "pushup"
      ? { shoulder: kp, elbow: kp, wrist: kp, hip: kp }
      : { hip: kp, knee: kp, ankle: kp };
  return {
    sk,
    sample: { angle, confidence: out ? 0.1 : 0.92, aligned, t, keypoints, bodyOk: exercise === "pushup" ? aligned : true },
  };
}
