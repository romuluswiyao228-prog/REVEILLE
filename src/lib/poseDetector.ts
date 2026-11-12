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

function minVis(lms: NormalizedLandmark[], ...idx: number[]): number {
  return Math.min(...idx.map((i) => vis(lms[i])));
}

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

  // ---- Pompes : angle du coude pour les DEUX côtés, on ne garde que le meilleur ----
  if (pushup) {
    const lScore = sideScore(lms, L_SHOULDER, L_ELBOW, L_WRIST);
    const rScore = sideScore(lms, R_SHOULDER, R_ELBOW, R_WRIST);
    const useLeft = lScore >= rScore;
    const best = Math.max(lScore, rScore);
    // Côté inexploitable : on ne considère pas la personne comme détectée.
    if (best < 0.3) return null;

    const sIdx = useLeft ? L_SHOULDER : R_SHOULDER;
    const eIdx = useLeft ? L_ELBOW : R_ELBOW;
    const wIdx = useLeft ? L_WRIST : R_WRIST;
    const kIdx = useLeft ? L_KNEE : R_KNEE;
    const aIdx = useLeft ? L_ANKLE : R_ANKLE;

    const angle = angleAt(pt(lms[sIdx]), pt(lms[eIdx]), pt(lms[wIdx]));

    // Confiance : uniquement les 3 points du côté choisi (pas de hanche,
    // aucune vérification d'alignement du corps).
    const keypoints: Record<string, number> = {
      shoulder: vis(lms[sIdx]),
      elbow: vis(lms[eIdx]),
      wrist: vis(lms[wIdx]),
    };
    const confidence = Object.values(keypoints).reduce((a, b) => a + b, 0) / 3;

    const shoulder = mid(lms[L_SHOULDER], lms[R_SHOULDER]);
    const hip = mid(lms[L_HIP], lms[R_HIP]);

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
      sample: { angle, confidence, aligned: true, t, keypoints },
      side: useLeft ? "left" : "right",
    };
  }

  // ---- Squats : inchangé (meilleur côté pour la jambe) ----
  const lScore = sideScore(lms, L_HIP, L_KNEE, L_ANKLE);
  const rScore = sideScore(lms, R_HIP, R_KNEE, R_ANKLE);
  const useLeft = lScore >= rScore;
  if (Math.max(lScore, rScore) < 0.3) return null;
  const i = useLeft ? 0 : 1;

  const keypoints: Record<string, number> = {
    hip: minVis(lms, L_HIP, R_HIP),
    knee: minVis(lms, L_KNEE, R_KNEE),
    ankle: minVis(lms, L_ANKLE, R_ANKLE),
  };
  const confidence = Object.values(keypoints).reduce((a, b) => a + b, 0) / 3;

  const angle = angleAt(mid(lms[L_HIP], lms[R_HIP]), pt(lms[L_KNEE + i]), pt(lms[L_ANKLE + i]));
  const shoulder = mid(lms[L_SHOULDER], lms[R_SHOULDER]);
  const hip = mid(lms[L_HIP], lms[R_HIP]);
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
    sample: { angle, confidence, aligned: true, t, keypoints },
    side: useLeft ? "left" : "right",
  };
}
