// Test rapide du RepCounter : node scripts/test-repcounter.mjs
import { RepCounter, buildConfig } from "../src/lib/repCounter.ts";

const cfg = buildConfig("pushup", "normal", "normal", false);
const KP = { shoulder: 0.9, elbow: 0.9, wrist: 0.9, hip: 0.9 };
const sample = (angle, t, conf = 0.92, kp = KP) => ({ angle, confidence: conf, aligned: true, t, keypoints: kp });

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${got}, want ${want}`);
}

// Envoie une suite d'angles à ~30fps. angles: nombre[] ou fn(i)=>angle
function feed(counter, angles, dt = 33) {
  let t = 0;
  let reps = 0;
  for (const a of angles) {
    t += dt;
    const angle = typeof a === "function" ? a(t) : a;
    if (counter.update(sample(angle, t))) reps++;
  }
  return { reps, counter };
}
const hold = (v, n) => Array(n).fill(v);
const ramp = (from, to, n) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

// 1. Personne immobile bras tendus pendant 10 s -> 0
{
  const c = new RepCounter(cfg);
  const { reps } = feed(c, hold(170, 300));
  check("immobile bras tendus", reps, 0);
  check("feedback pret", c.feedback, "ready");
}

// 2. Micro-mouvements (<8° sur 3 s) -> 0
{
  const c = new RepCounter(cfg);
  const jit = [];
  for (let i = 0; i < 300; i++) jit.push(i % 2 ? 164 : 160);
  const { reps } = feed(c, jit);
  check("gigue ±2°", reps, 0);
}

// 3. Cycle complet 170 -> 80 -> 170 -> +1, puis un second cycle -> 2
{
  const c = new RepCounter(cfg);
  const cycle = [...hold(170, 90), ...ramp(170, 80, 25), ...hold(80, 15), ...ramp(80, 172, 25), ...hold(172, 60)];
  const { reps } = feed(c, [...cycle, ...cycle]);
  check("deux cycles complets", reps, 2);
}

// 4. Descente partielle (min 110 > 90) puis remontée -> 0
{
  const c = new RepCounter(cfg);
  const seq = [...hold(170, 90), ...ramp(170, 110, 20), ...ramp(110, 172, 20), ...hold(172, 60)];
  const { reps } = feed(c, seq);
  check("descente partielle", reps, 0);
}

// 5. Frame avec point clé faible en pleine descente -> reset du cycle en cours.
//    La demi-cycle interrompue ne compte pas, mais un cycle complet suivant compte.
{
  const c = new RepCounter(cfg);
  let t = 0;
  let reps = 0;
  const push = (angle, kp = KP) => {
    t += 33;
    if (c.update(sample(angle, t, 0.92, kp))) reps++;
  };
  const cycle = [...hold(170, 90), ...ramp(170, 80, 25), ...hold(80, 15), ...ramp(80, 172, 25), ...hold(172, 60)];
  cycle.forEach((a, i) => push(a, i === 100 ? { ...KP, elbow: 0.4 } : KP));
  check("cycle interrompu ne compte pas", reps, 0);
  for (const a of cycle) push(a);
  check("cycle complet après reset", reps, 1);
}

// 6. Personne qui sort du cadre en pleine descente, revient, finit le cycle -> 1
{
  const c = new RepCounter(cfg);
  let t = 0;
  let reps = 0;
  const push = (angle) => {
    t += 33;
    if (c.update(sample(angle, t))) reps++;
  };
  for (const a of hold(170, 90)) push(a);
  for (const a of ramp(170, 120, 15)) push(a); // demi-descente
  for (let i = 0; i < 30; i++) { t += 33; c.update(null); } // hors cadre
  check("phase reset hors cadre", c.phase, "unknown");
  // elle revient bras tendus puis refait un cycle complet
  for (const a of [...hold(170, 30), ...ramp(170, 80, 25), ...hold(80, 15), ...ramp(80, 172, 25), ...hold(172, 60)]) push(a);
  check("cycle après retour", reps, 1);
}

// 7. Confiance globale faible -> ignoré
{
  const c = new RepCounter(cfg);
  let t = 0;
  let reps = 0;
  for (const a of hold(170, 100)) { t += 33; if (c.update(sample(a, t, 0.3))) reps++; }
  check("confiance faible", reps, 0);
  check("feedback hors cadre", c.feedback, "out_of_frame");
}

console.log(failures === 0 ? "\nTous les tests passent." : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
