import type { SoundId } from "./types";

let ctx: AudioContext | null = null;
let timer: number | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function audioRunning() {
  return !!ctx && ctx.state === "running";
}

interface Pattern {
  notes: number[];
  wave: OscillatorType;
  step: number; // s entre notes
  dur: number;
  period: number; // ms entre répétitions
}

const patterns: Record<SoundId, Pattern> = {
  sunrise: { notes: [523, 659, 784, 1046], wave: "sine", step: 0.16, dur: 0.3, period: 1500 },
  pulse: { notes: [440, 440], wave: "triangle", step: 0.18, dur: 0.14, period: 900 },
  digital: { notes: [1200, 0, 1200, 0, 1200], wave: "square", step: 0.1, dur: 0.07, period: 1000 },
  siren: { notes: [700, 950, 700, 950], wave: "sawtooth", step: 0.28, dur: 0.26, period: 1400 },
  beacon: { notes: [880, 660], wave: "sine", step: 0.35, dur: 0.3, period: 1200 },
};

function tone(freq: number, at: number, dur: number, wave: OscillatorType, vol: number) {
  const c = getCtx();
  if (!c || freq <= 0) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = wave;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.4), at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function playOnce(id: SoundId, volume: number) {
  const c = getCtx();
  if (!c) return;
  const p = patterns[id];
  const now = c.currentTime;
  p.notes.forEach((n, i) => tone(n, now + i * p.step, p.dur, p.wave, volume));
}

export function startAlarmSound(id: SoundId, volume: number) {
  stopAlarmSound();
  playOnce(id, volume);
  timer = window.setInterval(() => playOnce(id, volume), patterns[id].period);
}

export function stopAlarmSound() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export function previewSound(id: SoundId, volume: number) {
  playOnce(id, volume);
}

export function playRepTick() {
  const c = getCtx();
  if (!c) return;
  tone(880, c.currentTime, 0.08, "sine", 0.5);
}

export function playSuccess() {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, now + i * 0.12, 0.4, "triangle", 0.7));
}

export function vibrate(pattern: number | number[]) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
