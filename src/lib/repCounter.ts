// Compteur de répétitions : machine à états pure (sans dépendance UI).
// Même logique que flutter/lib/features/mission/rep_counter.dart.
//
// Cycle valide : HAUT -> BAS (descente suffisante) -> HAUT (remontée complète) => +1

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
}

export interface RepConfig {
  upAngle: number; // au-dessus => position haute
  downAngle: number; // en dessous => position basse validée
  minConfidence: number;
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
  // Profondeur à atteindre selon difficulté
  const down = {
    easy: pushup ? 110 : 120,
    normal: pushup ? 95 : 105,
    hard: pushup ? 80 : 90,
  }[difficulty];
  const up = pushup ? 155 : 160;
  // Sensibilité : élevée = tolère des repères moins fiables
  const conf = { low: 0.7, normal: 0.55, high: 0.4 }[sensitivity];
  return {
    upAngle: strict ? up : up - 10,
    downAngle: strict ? down : down + 8,
    minConfidence: conf,
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
  private lastRepAt = 0;
  private reachedDepth = false;
  private minAngleInRep = 180;

  constructor(public cfg: RepConfig) {}

  reset() {
    this.count = 0;
    this.phase = "unknown";
    this.feedback = "out_of_frame";
    this.window = [];
    this.lastRepAt = 0;
    this.reachedDepth = false;
    this.minAngleInRep = 180;
  }

  /** Retourne true si une répétition vient d'être validée. */
  update(s: PoseSample | null): boolean {
    const c = this.cfg;
    if (!s || s.confidence < c.minConfidence) {
      this.feedback = "out_of_frame";
      this.window = [];
      return false;
    }
    if (c.requireAlignment && !s.aligned) {
      this.feedback = "bad_position";
      return false;
    }

    this.window.push(s.angle);
    if (this.window.length > c.smoothing) this.window.shift();
    const a = this.window.reduce((x, y) => x + y, 0) / this.window.length;

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
