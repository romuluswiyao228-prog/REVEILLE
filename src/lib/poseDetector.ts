// Détection de pose réelle via MediaPipe Pose Landmarker (tâche vision, WASM local).
// Modèle et wasm servis depuis /mediapipe/ (public/) -> fonctionnel hors-ligne / PWA.
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { angleAt, type P, type Skeleton } from "./poseSim";
import type { Exercise, PoseSample } from "./repCounter";

export interface PoseDetection {
  sk: Skeleton;
  sample: PoseSample;
  /** Côté utilisé pour l'angle articulaire (debug). */
  side: "left" | "right";
}

/** Vrai si les 3 points du côté ont tous une visibilité >= minV. */
function sideUsable(lms: NormalizedLandmark[], s: number, e: number, w: number, minV: number): boolean {
  return vis(lms[s]) >= minV && vis(lms[e]) >= minV && vis(lms[w]) >= minV;
}

let landmarkerPromise: Promise<PoseLandmarker | null> | null = null;

const MODELS = ["/mediapipe/models/pose_landmarker_lite.task"];

export function getPoseLandmarker(): Promise<PoseLandmarker | null> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const options = (modelAssetPath: string, delegate: "GPU" | "CPU") => ({
          baseOptions: { modelAssetPath, delegate },
          runningMode: "VIDEO" as const,
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        for (const model of MODELS) {
          for (const delegate of ["GPU", "CPU"] as const) {
            try {
              return await PoseLandmarker.createFromOptions(vision, options(model, delegate));
            } catch {
              /* modèle ou delegate indisponible : on essaie le suivant */
            }
          }
        }
        return null;
      } catch (e) {
        console.error("PoseLandmarker init failed", e);
        return null;
      }
    })();
  }
  return landmarkerPromise;
}

// Indices MediaPipe Pose (33 points)
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_ELBOW = 13, R_ELBOW = 14;
const L_WRIST = 15, R_WRIST = 16;
const L_HIP = 23, R_HIP = 24;
const L_KNEE = 25, R_KNEE = 26;
const L_ANKLE = 27, R_ANKLE = 28;

const vis = (lm: NormalizedLandmark | undefined) => lm?.visibility ?? 0;
const pt = (lm: NormalizedLandmark): P => ({ x: lm.x, y: lm.y });
const mid = (a: NormalizedLandmark, b: NormalizedLandmark): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Visibilité moyenne des 3 points d'un côté (épaule/coude/poignet ou hanche/genou/cheville). */
function sideScore(lms: NormalizedLandmark[], s: number, e: number, w: number): number {
  return (vis(lms[s]) + vis(lms[e]) + vis(lms[w])) / 3;
}

/**
 * Détecte la pose dans une frame vidéo et produit un PoseSample.
 * Retourne null si aucune personne n'est détectée.
 * t = timestamp monotone en ms (ex. performance.now()).
 * Les calculs utilisent les coordonnées brutes (pas de miroir) ; seul le squelette
 * d'affichage est retourné en x mirroir pour coller à la vidéo frontale.
 */
export function detectPose(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  t: number,
  exercise: Exercise,
): PoseDetection | null {
  let result;
  try {
    result = landmarker.detectForVideo(video, t);
  } catch {
    return null;
  }
  const lms = result.landmarks?.[0];
  if (!lms || lms.length < 29) return null;

  const pushup = exercise === "pushup";

  // ---- Pompes : angle du coude pour les DEUX côtés ----
  // On garde le côté à meilleure visibilité moyenne parmi ceux dont les 3
  // points requis sont tous >= 0.5. Les deux bras ne sont jamais exigés.
  if (pushup) {
    const lOk = sideUsable(lms, L_SHOULDER, L_ELBOW, L_WRIST, 0.5);
    const rOk = sideUsable(lms, R_SHOULDER, R_ELBOW, R_WRIST, 0.5);
    if (!lOk && !rOk) return null; // frame ignorée : aucun côté exploitable
    const lScore = sideScore(lms, L_SHOULDER, L_ELBOW, L_WRIST);
    const rScore = sideScore(lms, R_SHOULDER, R_ELBOW, R_WRIST);
    const useLeft = lOk && (!rOk || lScore >= rScore);

    const sIdx = useLeft ? L_SHOULDER : R_SHOULDER;
    const eIdx = useLeft ? L_ELBOW : R_ELBOW;
    const wIdx = useLeft ? L_WRIST : R_WRIST;
    const kIdx = useLeft ? L_KNEE : R_KNEE;
    const aIdx = useLeft ? L_ANKLE : R_ANKLE;

    const angle = angleAt(pt(lms[sIdx]), pt(lms[eIdx]), pt(lms[wIdx]));

    // Confiance : uniquement les 3 points du côté choisi.
    const keypoints: Record<string, number> = {
      shoulder: vis(lms[sIdx]),
      elbow: vis(lms[eIdx]),
      wrist: vis(lms[wIdx]),
    };
    const confidence = Object.values(keypoints).reduce((a, b) => a + b, 0) / 3;

    const shoulder = mid(lms[L_SHOULDER], lms[R_SHOULDER]);
    const hip = mid(lms[L_HIP], lms[R_HIP]);
    const ankle = mid(lms[L_ANKLE], lms[R_ANKLE]);

    // Position de pompe (vérifiée UNE SEULE FOIS par le compteur) :
    // torse proche de l'horizontale ET poignets sous les épaules.
    const bodyAng = angleAt(shoulder, hip, ankle);
    const torsoOk = bodyAng > 150 || Math.abs(shoulder.y - hip.y) < 0.15;
    const wrist = pt(lms[wIdx]);
    const wristsUnder = Math.abs(wrist.x - shoulder.x) < 0.3 && wrist.y > shoulder.y;
    const posOk = torsoOk && wristsUnder;

    const sk: Skeleton = {
      shoulder: { x: (1 - shoulder.x) * 100, y: shoulder.y * 100 },
      elbow: { x: (1 - lms[eIdx].x) * 100, y: lms[eIdx].y * 100 },
      wrist: { x: (1 - lms[wIdx].x) * 100, y: lms[wIdx].y * 100 },
      hip: { x: (1 - hip.x) * 100, y: hip.y * 100 },
      knee: { x: (1 - lms[kIdx].x) * 100, y: lms[kIdx].y * 100 },
      ankle: { x: (1 - lms[aIdx].x) * 100, y: lms[aIdx].y * 100 },
    };
    return {
      sk,
      sample: { angle, confidence, aligned: posOk, posOk, t, keypoints },
      side: useLeft ? "left" : "right",
    };
  }

  // ---- Squats : angle hanche-genou-cheville, meilleur côté ----
  const lOk = sideUsable(lms, L_HIP, L_KNEE, L_ANKLE, 0.5);
  const rOk = sideUsable(lms, R_HIP, R_KNEE, R_ANKLE, 0.5);
  if (!lOk && !rOk) return null;
  const lScore = sideScore(lms, L_HIP, L_KNEE, L_ANKLE);
  const rScore = sideScore(lms, R_HIP, R_KNEE, R_ANKLE);
  const useLeft = lOk && (!rOk || lScore >= rScore);
  const i = useLeft ? 0 : 1;

  const keypoints: Record<string, number> = {
    hip: vis(lms[L_HIP + i]),
    knee: vis(lms[L_KNEE + i]),
    ankle: vis(lms[L_ANKLE + i]),
  };
  const confidence = Object.values(keypoints).reduce((a, b) => a + b, 0) / 3;

  const angle = angleAt(mid(lms[L_HIP], lms[R_HIP]), pt(lms[L_KNEE + i]), pt(lms[L_ANKLE + i]));
  const shoulder = mid(lms[L_SHOULDER], lms[R_SHOULDER]);
  const hip = mid(lms[L_HIP], lms[R_HIP]);
  const ankle = mid(lms[L_ANKLE], lms[R_ANKLE]);

  // Ratio de hauteur de hanche (fallback si l'angle est instable) :
  // ~0.6 debout, ~0.3 en squat profond. Convention y vers le bas.
  const hipRatio = Math.max(0, Math.min(1, (ankle.y - hip.y) / Math.max(0.01, ankle.y - shoulder.y)));

  const sk: Skeleton = {
    shoulder: { x: (1 - shoulder.x) * 100, y: shoulder.y * 100 },
    elbow: { x: (1 - lms[L_ELBOW + i].x) * 100, y: lms[L_ELBOW + i].y * 100 },
    wrist: { x: (1 - lms[L_WRIST + i].x) * 100, y: lms[L_WRIST + i].y * 100 },
    hip: { x: (1 - hip.x) * 100, y: hip.y * 100 },
    knee: { x: (1 - lms[L_KNEE + i].x) * 100, y: lms[L_KNEE + i].y * 100 },
    ankle: { x: (1 - lms[L_ANKLE + i].x) * 100, y: lms[L_ANKLE + i].y * 100 },
  };
  return {
    sk,
    sample: { angle, confidence, aligned: true, hipRatio, t, keypoints },
    side: useLeft ? "left" : "right",
  };
}
