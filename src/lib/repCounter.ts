// Compteur de répétitions : machine à états pure (sans dépendance UI).
// Même logique que flutter/lib/features/mission/rep_counter.dart.
//
// Cycle valide : HAUT -> BAS (descente suffisante) -> HAUT (remontée complète) => +1
// Une pompe = un cycle complet sur l'angle du coude :
//   bras tendus (> upAngle) -> flexion (< downAngle) -> retour bras tendus (> upAngle)

export type Difficulty = "easy" | "normal" | "hard";
export type Sensitivity = "low" | "normal" | "high";
export type Exercise = "pushup" | "squat";

export type Feedback =
  | "out_of_frame"
  | "get_in_position"
  | "ready"
  | "go_lower"
  | "push_up"
  | "good_rep"
  | "bad_position";

export interface PoseSample {
  /** Angle articulaire principal en degrés (coude pour pompes, genou pour squats). */
  angle: number;
  /** Confiance moyenne des repères requis, 0..1 */
  confidence: number;
  /** Corps aligné (pompes : épaule-hanche quasi horizontales ; squats : tronc vertical). */
  aligned: boolean;
  /** Timestamp ms */
  t: number;
  /** Confiance par point clé (ex. "shoulder", "elbow", "wrist", "hip"). */
  keypoints?: Record<string, number>;
}

export interface RepConfig {
  upAngle: number; // au-dessus => position haute (bras tendus)
  downAngle: number; // en dessous => position basse validée (flexion)
  minConfidence: number;
  minKeypoint: number; // confiance minimale par point clé requis
  keypoints: string[]; // points clés nécessaires à la détection
  motionWindowMs: number; // fenêtre d'analyse du mouvement réel
  minMotionRange: number; // amplitude angulaire min sur la fenêtre
  minRepMs: number;
  requireAlignment: boolean;
  smoothing: number; // taille de fenêtre de lissage
}

export function buildConfig(
  exercise: Exercise,
  difficulty: Difficulty,
  sensitivity: Sensitivity,
  strict: boolean,
): RepConfig {
  const pushup = exercise === "pushup";
  // Pompes : cycle complet coude >150° -> <90° -> >150° (seuils fixes).
  // Squats : profondeur selon difficulté.
  const down = pushup ? 90 : { easy: 120, normal: 105, hard: 90 }[difficulty];
  const up = pushup ? 150 : strict ? 160 : 150;
  // Sensibilité : élevée = tolère des repères moins fiables
  const conf = { low: 0.7, normal: 0.55, high: 0.4 }[sensitivity];
  return {
    upAngle: up,
    downAngle: strict || pushup ? down : down + 8,
    minConfidence: conf,
    minKeypoint: 0.6,
    keypoints: pushup ? ["shoulder", "elbow", "wrist", "hip"] : ["hip", "knee", "ankle"],
    motionWindowMs: 3000,
    minMotionRange: 8,
    minRepMs: strict ? 700 : 450,
    requireAlignment: strict,
    smoothing: sensitivity === "high" ? 2 : 3,
  };
}

type Phase = "unknown" | "up" | "down";

export class RepCounter {
  count = 0;
  phase: Phase = "unknown";
  feedback: Feedback = "out_of_frame";
  private window: number[] = [];
  private history: { t: number; a: number }[] = [];
  private lastRepAt = 0;
  private reachedDepth = false;
  private minAngleInRep = 180;

  readonly cfg: RepConfig;

  constructor(cfg: RepConfig) {
    this.cfg = cfg;
  }

  reset() {
    this.count = 0;
    this.phase = "unknown";
    this.feedback = "out_of_frame";
    this.window = [];
    this.history = [];
    this.lastRepAt = 0;
    this.reachedDepth = false;
    this.minAngleInRep = 180;
  }

  /** Une personne est détectée : confiance globale + points clés requis >= seuil. */
  private personVisible(s: PoseSample): boolean {
    if (s.confidence < this.cfg.minConfidence) return false;
    const kp = s.keypoints;
    if (kp) {
      for (const k of this.cfg.keypoints) {
        if ((kp[k] ?? 0) < this.cfg.minKeypoint) return false;
      }
    }
    return true;
  }

  /** Vrai si l'angle a varié d'au moins minMotionRange sur les dernières motionWindowMs. */
  private hasRealMotion(now: number): boolean {
    const c = this.cfg;
    while (this.history.length && now - this.history[0].t > c.motionWindowMs) this.history.shift();
    if (this.history.length < 2) return false;
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of this.history) {
      if (h.a < lo) lo = h.a;
      if (h.a > hi) hi = h.a;
    }
    return hi - lo >= c.minMotionRange;
  }

  /** Retourne true si une répétition vient d'être validée. */
  update(s: PoseSample | null): boolean {
    const c = this.cfg;
    if (!s || !this.personVisible(s)) {
      // Caméra inactive ou personne hors cadre : on abandonne le cycle en cours
      // (le compteur n'est pas remis à zéro).
      this.phase = "unknown";
      this.reachedDepth = false;
      this.window = [];
      this.history = [];
      this.feedback = "out_of_frame";
      return false;
    }
    if (c.requireAlignment && !s.aligned) {
      this.feedback = "bad_position";
      return false;
    }

    this.window.push(s.angle);
    if (this.window.length > c.smoothing) this.window.shift();
    const a = this.window.reduce((x, y) => x + y, 0) / this.window.length;

    // Mouvement réel exigé : sinon aucune transition d'état, aucun comptage.
    this.history.push({ t: s.t, a });
    if (!this.hasRealMotion(s.t)) {
      this.feedback = a >= c.upAngle ? "ready" : "get_in_position";
      return false;
    }

    if (this.phase === "unknown") {
      if (a >= c.upAngle) {
        this.phase = "up";
        this.feedback = "ready";
        this.minAngleInRep = 180;
      } else {
        this.feedback = "get_in_position";
      }
      return false;
    }

    if (this.phase === "up") {
      this.minAngleInRep = Math.min(this.minAngleInRep, a);
      if (a <= c.downAngle) {
        this.phase = "down";
        this.reachedDepth = true;
        this.feedback = "push_up";
      } else if (a < c.upAngle - 5) {
        this.feedback = "go_lower";
      } else {
        this.feedback = "ready";
      }
      return false;
    }

    // phase === "down"
    if (a >= c.upAngle) {
      const okDepth = this.reachedDepth;
      const okTime = s.t - this.lastRepAt >= c.minRepMs;
      this.phase = "up";
      this.reachedDepth = false;
      this.minAngleInRep = 180;
      if (okDepth && okTime) {
        this.count++;
        this.lastRepAt = s.t;
        this.feedback = "good_rep";
        return true;
      }
      this.feedback = "ready";
    } else {
      this.feedback = "push_up";
    }
    return false;
  }
}
