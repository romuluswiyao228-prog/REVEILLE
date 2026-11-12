// Compteur de répétitions — machine à états inspirée des pipelines MediaPipe.
//
// Cycle valide : départ stable (état haut maintenu holdFrames frames)
//   -> bas atteint -> retour en haut. +1 uniquement si :
//   - amplitude min de l'angle pendant le cycle >= minAmp
//   - durée du cycle entre minCycleMs et maxCycleMs
// Perte de personne > maxLostMs -> retour en "attente du départ" (le compteur
// n'est jamais remis à zéro). Les sauts d'angle > jumpDeg sont ignorés.

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
  /** Conservé pour compatibilité (alignement corps). */
  aligned: boolean;
  /** Pompes : position de pompe valide (torse horizontal, poignets sous les épaules). */
  posOk?: boolean;
  /** Squats : hauteur relative de la hanche (0 = cheville, 1 = épaule), fallback si angle instable. */
  hipRatio?: number;
  /** Timestamp ms (horloge monotone, même base que detectForVideo). */
  t: number;
  /** Confiance/visibilité par point clé requis. */
  keypoints?: Record<string, number>;
}

export interface RepConfig {
  exercise: Exercise;
  upAngle: number; // seuil "en haut" (coude > 150° / genou > 160°)
  downAngle: number; // seuil "en bas" (coude < 105° / genou < 110°)
  holdFrames: number; // frames consécutives en haut pour verrouiller le départ
  minKeypoint: number; // visibilité minimale par point clé requis
  keypoints: string[]; // points clés nécessaires
  minConfidence: number;
  emaAlpha: number; // lissage exponentiel de l'angle
  maxLostMs: number; // absence de personne avant retour en attente
  jumpDeg: number; // saut d'angle ignoré entre deux frames
  minAmp: number; // amplitude angulaire min du cycle
  minCycleMs: number;
  maxCycleMs: number;
  hipBottom: number; // squats : seuil bas du ratio hanche
  hipTop: number; // squats : seuil haut du ratio hanche
}

export function buildConfig(
  exercise: Exercise,
  _difficulty: Difficulty,
  sensitivity: Sensitivity,
  _strict: boolean,
): RepConfig {
  const pushup = exercise === "pushup";
  return {
    exercise,
    upAngle: pushup ? 150 : 160,
    downAngle: pushup ? 105 : 110,
    holdFrames: 5,
    minKeypoint: 0.5,
    keypoints: pushup ? ["shoulder", "elbow", "wrist"] : ["hip", "knee", "ankle"],
    minConfidence: { low: 0.5, normal: 0.4, high: 0.3 }[sensitivity],
    emaAlpha: 0.5,
    maxLostMs: 1000,
    jumpDeg: 60,
    minAmp: 50,
    minCycleMs: 500,
    maxCycleMs: 10000,
    // Ratio hanche : ~0.6 debout, ~0.3 en squat profond (hystérésis).
    hipBottom: 0.45,
    hipTop: 0.55,
  };
}

/** Phase exposée à l'UI (flèches directionnelles). */
export type Phase = "unknown" | "up" | "down";

type Mode = "wait" | "armed" | "bottom";

export class RepCounter {
  count = 0;
  phase: Phase = "unknown";
  feedback: Feedback = "out_of_frame";
  /** Verrou de départ acquis pour le cycle en cours (debug ?debug=1). */
  locked = false;
  /** Position de pompe déjà validée une fois (plus jamais revérifiée). */
  posChecked = false;

  readonly cfg: RepConfig;

  private mode: Mode = "wait";
  private holdN = 0;
  private ema: number | null = null;
  private prevRaw: number | null = null;
  private lastValidT = -Infinity;
  private cycleStartT = 0;
  private refVal = 0;
  private minVal = 0;
  private ampMin = 0;
  private useHip = false;
  private jumpSkips = 0;

  constructor(cfg: RepConfig) {
    this.cfg = cfg;
  }

  reset() {
    this.count = 0;
    this.resetCycle();
    this.ema = null;
    this.prevRaw = null;
    this.lastValidT = -Infinity;
    this.posChecked = false;
    this.useHip = false;
    this.jumpSkips = 0;
  }

  /** Retour à "attente du départ" sans remettre le compteur à zéro. */
  private resetCycle(feedback: Feedback = "out_of_frame") {
    this.mode = "wait";
    this.holdN = 0;
    this.locked = false;
    this.phase = "unknown";
    this.feedback = feedback;
    this.minVal = 0;
    this.refVal = 0;
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

  /** Verrouille le départ : le cycle peut commencer. */
  private arm(t: number, sig: number) {
    const c = this.cfg;
    this.mode = "armed";
    this.cycleStartT = t;
    this.refVal = sig;
    this.minVal = sig;
    this.ampMin = c.exercise === "squat" && this.useHip ? 0.2 : c.minAmp;
    this.locked = true;
    this.phase = "down";
    this.feedback = "ready";
  }

  /**
   * Une frame de pose (ou null si aucune personne). `t` = timestamp monotone ms,
   * sur la même base que PoseSample.t / video.currentTime.
   * Retourne true si une répétition vient d'être validée.
   */
  update(s: PoseSample | null, t: number): boolean {
    const c = this.cfg;

    // Aucune personne détectée depuis plus de maxLostMs -> attente du départ.
    if (this.lastValidT > -Infinity && t - this.lastValidT > c.maxLostMs) {
      this.resetCycle("out_of_frame");
    }
    if (!s || !this.personVisible(s)) return false;
    this.lastValidT = t;

    // Saut d'angle brutal (> jumpDeg entre deux frames consécutives) : frame
    // ignorée pour l'EMA et la machine à états ; le dernier angle valide est
    // conservé. prevRaw suit quand même la frame pour ne pas rester bloqué.
    if (this.prevRaw !== null && Math.abs(s.angle - this.prevRaw) > c.jumpDeg) {
      this.prevRaw = s.angle;
      this.jumpSkips++;
      // Squats : angle trop instable -> bascule sur le ratio de hauteur de hanche.
      if (c.exercise === "squat" && this.jumpSkips > 10 && s.hipRatio != null) this.useHip = true;
      return false;
    }
    this.prevRaw = s.angle;

    // Lissage EMA de l'angle.
    this.ema = this.ema === null ? s.angle : c.emaAlpha * s.angle + (1 - c.emaAlpha) * this.ema;

    // Signal du cycle : angle articulaire, ou ratio hanche pour squats instables.
    let sig = this.ema;
    let upT = c.upAngle;
    let downT = c.downAngle;
    if (c.exercise === "squat" && this.useHip && s.hipRatio != null) {
      sig = s.hipRatio;
      upT = c.hipTop;
      downT = c.hipBottom;
    }

    if (this.mode === "wait") {
      if (sig > upT) {
        this.holdN++;
        if (this.holdN >= c.holdFrames) {
          // Pompes : position vérifiée UNE SEULE FOIS avant la première répétition.
          if (c.exercise === "pushup" && !this.posChecked) {
            if (s.posOk) {
              this.posChecked = true;
              this.arm(t, sig);
            } else {
              this.feedback = "get_in_position";
            }
          } else {
            this.arm(t, sig);
          }
        }
      } else {
        this.holdN = 0;
        this.feedback = "get_in_position";
      }
      // Si arm() vient de verrouiller le départ, on ne réinitialise pas locked.
      if (this.mode === "wait") {
        this.phase = "unknown";
        this.locked = false;
      }
      return false;
    }

    // Le point le plus bas du cycle est suivi en armed ET en bottom.
    this.minVal = Math.min(this.minVal, sig);

    if (this.mode === "armed") {
      if (sig < downT) {
        this.mode = "bottom";
        this.feedback = "push_up";
        this.phase = "up";
      } else {
        this.feedback = sig < upT - 10 ? "go_lower" : "ready";
        this.phase = "down";
      }
      return false;
    }

    // mode === "bottom" : retour en haut => fin de cycle.
    this.phase = "up";
    if (sig > upT) {
      const amp = this.refVal - this.minVal;
      const dur = t - this.cycleStartT;
      const ok = amp >= this.ampMin && dur >= c.minCycleMs && dur <= c.maxCycleMs;
      this.resetCycle(ok ? "good_rep" : "get_in_position");
      if (!ok) return false;
      this.count++;
      return true;
    }
    this.feedback = "push_up";
    return false;
  }
}
