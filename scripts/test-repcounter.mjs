// Test rapide du RepCounter (nouvelle machine à états) : node scripts/test-repcounter.mjs
import { RepCounter, buildConfig } from "../src/lib/repCounter.ts";

const cfgP = buildConfig("pushup", "normal", "normal", false);
const cfgS = buildConfig("squat", "normal", "normal", false);
const KP = { shoulder: 0.9, elbow: 0.9, wrist: 0.9 };
const KP_S = { hip: 0.9, knee: 0.9, ankle: 0.9 };
const sample = (angle, t, conf = 0.92, kp = KP, extra = { posOk: true }) => ({
  angle, confidence: conf, aligned: true, t, keypoints: kp, ...extra,
});

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${got}, want ${want}`);
}

// Envoie une suite d'angles à ~30fps. entries: angle | null (personne absente) | {angle,...}
function feed(counter, seq, dt = 33, t0 = 0) {
  let t = t0;
  let reps = 0;
  for (const a of seq) {
    t += dt;
    const s = a === null ? null : typeof a === "number" ? sample(a, t) : sample(a.angle, t, a.conf ?? 0.92, a.kp ?? KP, a.extra ?? {});
    if (counter.update(s, t)) reps++;
  }
  return { reps, t };
}
const hold = (v, n) => Array(n).fill(v);
const ramp = (from, to, n) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
// Cycle pompe complet : 20f haut (verrou 5f) -> descente -> bas -> montée
const pushCycle = (top = 172, bot = 80) => [
  ...hold(top, 20),
  ...ramp(top, bot, 25),
  ...hold(bot, 15),
  ...ramp(bot, top + 2, 25),
  ...hold(top + 2, 30),
];
const squatCycle = (top = 172, bot = 85) => [
  ...hold(top, 20),
  ...ramp(top, bot, 25),
  ...hold(bot, 15),
  ...ramp(bot, top + 2, 25),
  ...hold(top + 2, 30),
];

// 1. Immobile bras tendus 10 s -> 0 (mais départ verrouillé, normal)
{
  const c = new RepCounter(cfgP);
  const { reps } = feed(c, hold(170, 300));
  check("immobile bras tendus", reps, 0);
  check("depart verrouille", c.locked, true);
}

// 2. Micro-mouvements -> 0
{
  const c = new RepCounter(cfgP);
  const jit = [];
  for (let i = 0; i < 300; i++) jit.push(i % 2 ? 164 : 160);
  const { reps } = feed(c, jit);
  check("gigue ±2°", reps, 0);
}

// 3. Deux cycles complets de pompes -> 2
{
  const c = new RepCounter(cfgP);
  const { reps } = feed(c, [...pushCycle(), ...pushCycle()]);
  check("deux cycles pompes", reps, 2);
}

// 4. Descente partielle (reste > 105°) -> 0
{
  const c = new RepCounter(cfgP);
  const seq = [...hold(172, 20), ...ramp(172, 120, 25), ...hold(120, 15), ...ramp(120, 174, 25), ...hold(174, 30)];
  const { reps } = feed(c, seq);
  check("descente partielle", reps, 0);
}

// 5. Position de pompe jamais valide -> jamais armé -> 0
{
  const c = new RepCounter(cfgP);
  const seq = pushCycle().map((a) => (typeof a === "number" ? { angle: a, extra: { posOk: false } } : a));
  const { reps } = feed(c, seq);
  check("posOk=false bloque", reps, 0);
  check("feedback position", c.feedback, "get_in_position");
}

// 6. posOk exigé une seule fois : 1er cycle avec posOk, suivants sans -> compte quand même
{
  const c = new RepCounter(cfgP);
  const first = pushCycle().map((a) => (typeof a === "number" ? { angle: a, extra: { posOk: true } } : a));
  const later = pushCycle().map((a) => (typeof a === "number" ? { angle: a, extra: { posOk: false } } : a));
  const { reps } = feed(c, [...first, ...later]);
  check("posOk verifie une fois", reps, 2);
}

// 7. Perte de personne > 1 s en pleine descente -> retour attente, cycle incomplet perdu, compteur conservé
{
  const c = new RepCounter(cfgP);
  const seq = [...hold(172, 20), ...ramp(172, 90, 25), ...hold(90, 15)];
  const { reps, t } = feed(c, seq);
  check("milieu descente", reps, 0);
  // 2 s sans personne
  const r2 = feed(c, Array(60).fill(null), 33, t);
  check("phase reset apres perte", c.phase, "unknown");
  check("compteur conserve", c.count, 0);
  const r3 = feed(c, pushCycle(), 33, r2.t);
  check("cycle apres perte", r3.reps, 1);
}

// 8. Saut d'angle > 60° ignoré (frame gâtée, état conservé)
{
  const c = new RepCounter(cfgP);
  const seq = [...hold(172, 20), 100, ...ramp(100, 80, 25), ...hold(80, 15), ...ramp(80, 174, 25), ...hold(174, 30)];
  const { reps } = feed(c, seq);
  check("saut 60° gere", reps, 1);
}

// 9. Cycle trop court (< 0.5 s) -> invalide (dt=10ms pour compenser le lag EMA)
{
  const c = new RepCounter(cfgP);
  const seq = [...hold(172, 20), ...ramp(172, 80, 3), ...hold(80, 3), ...ramp(80, 174, 3), ...hold(174, 10)];
  const { reps } = feed(c, seq, 10);
  check("cycle trop court", reps, 0);
}

// 10. Squats : cycle complet genou -> 1
{
  const c = new RepCounter(cfgS);
  const seq = squatCycle().map((a) => (typeof a === "number" ? { angle: a, kp: KP_S, extra: { hipRatio: 0 } } : a));
  // hipRatio:0 invaliderait le fallback mais l'angle suffit tant qu'il est stable
  seq.forEach((s) => { if (s && s.extra) s.extra = {}; });
  const { reps } = feed(c, seq);
  check("cycle squat", reps, 1);
}

// 11. Squats : points clés < 0.5 -> ignoré
{
  const c = new RepCounter(cfgS);
  const seq = squatCycle().map((a) => ({ angle: a, kp: { hip: 0.4, knee: 0.9, ankle: 0.9 } }));
  const { reps } = feed(c, seq);
  check("squat kp faible", reps, 0);
}

// 12. Squats : ratio hanche seul (angle instable) -> cycle compté via hysteresis
{
  const c = new RepCounter(cfgS);
  const seq = [];
  const push = (angle, hip) => seq.push({ angle, kp: KP_S, extra: { hipRatio: hip } });
  // >10 sauts d'angle -> bascule sur le ratio hanche
  for (let i = 0; i < 15; i++) push(i % 2 ? 200 : 40, 0.6);
  // stabilisation + maintien haut (verrou 5 frames sur hipRatio > 0.55)
  for (let i = 0; i < 15; i++) push(170, 0.6);
  // descente : 0.6 -> 0.3 (< 0.45 = bas)
  for (let i = 0; i < 40; i++) push(170, 0.6 - i * 0.0075);
  // maintien bas
  for (let i = 0; i < 10; i++) push(170, 0.3);
  // remontée : 0.3 -> 0.62 (> 0.55 = haut)
  for (let i = 0; i < 40; i++) push(170, 0.3 + i * 0.008);
  for (let i = 0; i < 20; i++) push(170, 0.62);
  const { reps } = feed(c, seq);
  check("squat fallback hanche", reps, 1);
}

console.log(failures === 0 ? "\nTous les tests passent." : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
