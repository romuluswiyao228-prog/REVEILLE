// Compteur de répétitions : machine à états pure (sans dépendance UI).
// Même logique que flutter/lib/features/mission/rep_counter.dart.
//
// Pompes — cycle complet sur l'angle du coude :
//   READY (coude > upAngle + corps horizontal, tenu readyHoldFrames)
//     -> DOWN (coude < downAngle, tenu transitionHoldFrames)
//     -> UP   (coude > upAngle, tenu transitionHoldFrames) => +1
// Aucune pompe sans passage par DOWN ; le corps doit rester horizontal.

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
  /** Corps aligné (hérité, utilisé par les modes stricts/démo). */
  aligned: boolean;
  /** Timestamp ms */
  t: number;
  /** Confiance par point clé (ex. "shoulder", "elbow", "wrist", "hip"). */
  keypoints?: Record<string, number>;
  /** Corps globalement horizontal — requis pour valider une pompe. undefined = pas d'info. */
  bodyOk?: boolean;
}

export interface RepConfig {
  upAngle: number; // au-dessus => position haute (bras tendus)
  downAngle: number; // en dessous => position basse validée (flexion)
  minConfidence: number;
  minKeypoint: number; // confiance minimale par point clé requis
  keypoints: string[]; // points clés nécessaires à la détection
  readyHoldFrames: number; // frames consécutives pour valider READY
  transitionHoldFrames: number; // frames consécutives pour chaque transition
  emaAlpha: number; // lissage exponentiel de l'angle
  requireHorizontal: boolean; // pompes : corps horizontal exigé
  minRepMs: number;
  requireAlignment: boolean;
}

export function buildConfig(
  exercise: Exercise,
  difficulty: Difficulty,
  sensitivity: Sensitivity,
  strict: boolean,
): RepConfig {
  const pushup = exercise === "pushup";
  // Pompes : cycle complet coude >150° -> <100° -> >150° (seuils fixes).
  // Squats : profondeur selon difficulté.
  const down = pushup ? 100 : { easy: 120, normal: 105, hard: 90 }[difficulty];
  const up = pushup ? 150 : strict ? 160 : 150;
  // Sensibilité : élevée = tolère des repères moins fiables
  const conf = { low: 0.7, normal: 0.55, high: 0.4 }[sensitivity];
  return {
    upAngle: up,
    downAngle: strict || pushup ? down : down + 8,
    minConfidence: conf,
    minKeypoint: 0.6,
    keypoints: pushup ? ["shoulder", "elbow", "wrist", "hip"] : ["hip", "knee", "ankle"],
    readyHoldFrames: 5,
    transitionHoldFrames: 3,
    emaAlpha: 0.4,
    requireHorizontal: pushup,
    minRepMs: strict ? 700 : 450,
    requireAlignment: strict,
  };
}

type Phase = "unknown" | "up" | "down";

export class RepCounter {
  count = 0;
  phase: Phase = "unknown";
  feedback: Feedback = "out_of_frame";
  private ema: number | null = null;
  private hold = 0;
  private lastRepAt = 0;

  readonly cfg: RepConfig;

  constructor(cfg: RepConfig) {
    this.cfg = cfg;
  }

  reset() {
    this.count = 0;
    this.phase = "unknown";
    this.feedback = "out_of_frame";
    this.ema = null;
    this.hold = 0;
    this.lastRepAt = 0;
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

  /** Abandonne le cycle en cours sans remettre le compteur à zéro. */
  private abortCycle(feedback: Feedback) {
    this.phase = "unknown";
    this.hold = 0;
    this.ema = null;
    this.feedback = feedback;
  }

  /** Retourne true si une répétition vient d'être validée. */
  update(s: PoseSample | null): boolean {
    const c = this.cfg;
    if (!s || !this.personVisible(s)) {
      // Caméra inactive ou personne hors cadre.
      this.abortCycle("out_of_frame");
      return false;
    }
    if (c.requireAlignment && !s.aligned) {
      this.abortCycle("bad_position");
      return false;
    }
    // Pompes : le corps doit être horizontal, sinon retour à l'état initial.
    if (c.requireHorizontal && s.bodyOk === false) {
      this.abortCycle("get_in_position");
      return false;
    }

    // Lissage exponentiel de l'angle (supprime les saccades).
    this.ema = this.ema === null ? s.angle : c.emaAlpha * s.angle + (1 - c.emaAlpha) * this.ema;
    const a = this.ema;

    if (this.phase === "unknown") {
      // READY : bras tendus tenus readyHoldFrames consécutives.
      if (a > c.upAngle) {
        this.hold++;
        if (this.hold >= c.readyHoldFrames) {
          this.phase = "up";
          this.feedback = "ready";
        } else {
          this.feedback = "get_in_position";
        }
      } else {
        this.hold = 0;
        this.feedback = "get_in_position";
      }
      return false;
    }

    if (this.phase === "up") {
      // READY -> DOWN : flexion tenue transitionHoldFrames.
      if (a < c.downAngle) {
        this.hold++;
        if (this.hold >= c.transitionHoldFrames) {
          this.phase = "down";
          this.hold = 0;
          this.feedback = "push_up";
        } else {
          this.feedback = "go_lower";
        }
      } else {
        this.hold = 0;
        this.feedback = a < c.upAngle - 5 ? "go_lower" : "ready";
      }
      return false;
    }

    // phase === "down" : DOWN -> UP, puis +1 si le temps minimal est respecté.
    if (a > c.upAngle) {
      this.hold++;
      if (this.hold >= c.transitionHoldFrames) {
        const okTime = s.t - this.lastRepAt >= c.minRepMs;
        this.phase = "up";
        this.hold = 0;
        if (okTime) {
          this.count++;
          this.lastRepAt = s.t;
          this.feedback = "good_rep";
          return true;
        }
        this.feedback = "ready";
      } else {
        this.feedback = "push_up";
      }
    } else {
      this.hold = 0;
      this.feedback = "push_up";
    }
    return false;
  }
}
