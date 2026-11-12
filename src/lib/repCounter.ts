// Compteur de répétitions : machine à états pure (sans dépendance UI).
// Même logique que flutter/lib/features/mission/rep_counter.dart.
//
// Pompes — cycle complet sur l'angle du coude (épaule-coude-poignet) :
//   UP    (coude > upAngle)
//     -> DOWN (coude < downAngle)
//     -> UP   (coude > upAngle) => +1
// Aucune pompe sans passage par DOWN ; une frame perdue ne reset l'état
// qu'après 10 frames consécutives. Le compteur n'est jamais remis à zéro.

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
  /** Corps aligné (conservé pour compatibilité, plus utilisé par la machine à états). */
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
  emaAlpha: number; // lissage exponentiel de l'angle
  lostFrames: number; // frames de grâce avant reset quand les points disparaissent
  minRepMs: number;
}

export function buildConfig(
  exercise: Exercise,
  difficulty: Difficulty,
  sensitivity: Sensitivity,
  strict: boolean,
): RepConfig {
  const pushup = exercise === "pushup";
  // Pompes : cycle complet coude >145° -> <105° -> >145° (seuils fixes).
  // Squats : profondeur selon difficulté.
  const down = pushup ? 105 : { easy: 120, normal: 105, hard: 90 }[difficulty];
  const up = pushup ? 145 : strict ? 160 : 150;
  // Sensibilité : élevée = tolère des repères moins fiables
  const conf = { low: 0.7, normal: 0.55, high: 0.4 }[sensitivity];
  return {
    upAngle: up,
    downAngle: strict || pushup ? down : down + 8,
    // Pompes : le comptage repose uniquement sur l'angle du coude du côté le
    // mieux visible ; le détecteur garantit déjà une visibilité moyenne >= 0.3.
    minConfidence: pushup ? 0.3 : conf,
    minKeypoint: pushup ? 0.3 : 0.6,
    keypoints: pushup ? ["shoulder", "elbow", "wrist"] : ["hip", "knee", "ankle"],
    emaAlpha: 0.5,
    lostFrames: 10,
    minRepMs: strict ? 700 : 450,
  };
}

type Phase = "unknown" | "up" | "down";

export class RepCounter {
  count = 0;
  phase: Phase = "unknown";
  feedback: Feedback = "out_of_frame";
  private ema: number | null = null;
  private lost = 0;
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
    this.lost = 0;
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
    this.lost = 0;
    this.feedback = feedback;
  }

  /** Retourne true si une répétition vient d'être validée. */
  update(s: PoseSample | null): boolean {
    const c = this.cfg;
    if (!s || !this.personVisible(s)) {
      // Points disparus : on conserve l'état jusqu'à lostFrames frames,
      // puis on repart de l'état initial (le compteur n'est pas remis à zéro).
      this.lost++;
      if (this.lost > c.lostFrames) this.abortCycle("out_of_frame");
      return false;
    }
    this.lost = 0;

    // Lissage exponentiel de l'angle (supprime les saccades).
    this.ema = this.ema === null ? s.angle : c.emaAlpha * s.angle + (1 - c.emaAlpha) * this.ema;
    const a = this.ema;

    if (this.phase === "unknown") {
      // Départ automatique en UP dès que le coude est au-dessus du seuil.
      if (a > c.upAngle) {
        this.phase = "up";
        this.feedback = "ready";
      } else {
        this.feedback = "get_in_position";
      }
      return false;
    }

    if (this.phase === "up") {
      // UP -> DOWN : flexion sous le seuil bas.
      if (a < c.downAngle) {
        this.phase = "down";
        this.feedback = "push_up";
      } else {
        this.feedback = a < c.upAngle - 5 ? "go_lower" : "ready";
      }
      return false;
    }

    // phase === "down" : DOWN -> UP, +1 à la fin du cycle complet.
    if (a > c.upAngle) {
      const okTime = s.t - this.lastRepAt >= c.minRepMs;
      this.phase = "up";
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
    return false;
  }
}
