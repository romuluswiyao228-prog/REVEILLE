// Détection de pose réelle via MediaPipe Pose Landmarker (tâche vision, WASM local).
// Modèle et wasm servis depuis /mediapipe/ (public/) -> fonctionnel hors-ligne / PWA.
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { angleAt, type P, type Skeleton } from "./poseSim";
import type { Exercise, PoseSample } from "./repCounter";

export interface PoseDetection {
  sk: Skeleton;
  sample: PoseSample;
}

let landmarkerPromise: Promise<PoseLandmarker | null> | null = null;

export function getPoseLandmarker(): Promise<PoseLandmarker | null> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const options = (delegate: "GPU" | "CPU") => ({
          baseOptions: {
            modelAssetPath: "/mediapipe/models/pose_landmarker_lite.task",
            delegate,
          },
          runningMode: "VIDEO" as const,
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        try {
          return await PoseLandmarker.createFromOptions(vision, options("GPU"));
        } catch {
          return await PoseLandmarker.createFromOptions(vision, options("CPU"));
        }
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

function minVis(lms: NormalizedLandmark[], ...idx: number[]): number {
  return Math.min(...idx.map((i) => vis(lms[i])));
}

/** Côté le plus visible pour le membre surveillé (gauche vs droite). */
function bestSide(lms: NormalizedLandmark[], a: number, b: number, c: number): 0 | 1 {
  const left = vis(lms[a]) + vis(lms[b]) + vis(lms[c]);
  const right = vis(lms[a + 1]) + vis(lms[b + 1]) + vis(lms[c + 1]);
  return left >= right ? 0 : 1;
}

/**
 * Détecte la pose dans une frame vidéo et produit un PoseSample.
 * Retourne null si aucune personne n'est détectée.
 * t = timestamp monotone en ms (ex. performance.now()).
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
  // Scores par point clé (min gauche/droite)
  const keypoints: Record<string, number> = pushup
    ? {
        shoulder: minVis(lms, L_SHOULDER, R_SHOULDER),
        elbow: minVis(lms, L_ELBOW, R_ELBOW),
        wrist: minVis(lms, L_WRIST, R_WRIST),
        hip: minVis(lms, L_HIP, R_HIP),
      }
    : {
        hip: minVis(lms, L_HIP, R_HIP),
        knee: minVis(lms, L_KNEE, R_KNEE),
        ankle: minVis(lms, L_ANKLE, R_ANKLE),
      };
  const required = Object.values(keypoints);
  const confidence = required.reduce((a, b) => a + b, 0) / required.length;

  // Côté le plus fiable pour l'angle articulaire
  const side = pushup
    ? bestSide(lms, L_SHOULDER, L_ELBOW, L_WRIST)
    : bestSide(lms, L_HIP, L_KNEE, L_ANKLE);
  const i = side === 0 ? 0 : 1;

  const shoulder = { x: (lms[L_SHOULDER].x + lms[R_SHOULDER].x) / 2, y: (lms[L_SHOULDER].y + lms[R_SHOULDER].y) / 2 };
  const hip = { x: (lms[L_HIP].x + lms[R_HIP].x) / 2, y: (lms[L_HIP].y + lms[R_HIP].y) / 2 };

  let angle: number;
  if (pushup) {
    angle = angleAt(shoulder, pt(lms[L_ELBOW + i]), pt(lms[L_WRIST + i]));
    // Alignement : épaule et hanche doivent former un axe plutôt vertical
    // (corps allongé perpendiculaire au sol, vu de face).
    const dx = Math.abs(shoulder.x - hip.x);
    const dy = Math.abs(shoulder.y - hip.y);
    const aligned = dy > dx * 0.6;
    // Skeleton pour l'overlay (coords 0-100, x mirroir comme la vidéo)
    const sk: Skeleton = {
      shoulder: { x: (1 - shoulder.x) * 100, y: shoulder.y * 100 },
      elbow: { x: (1 - lms[L_ELBOW + i].x) * 100, y: lms[L_ELBOW + i].y * 100 },
      wrist: { x: (1 - lms[L_WRIST + i].x) * 100, y: lms[L_WRIST + i].y * 100 },
      hip: { x: (1 - hip.x) * 100, y: hip.y * 100 },
      knee: { x: (1 - lms[L_KNEE + i].x) * 100, y: lms[L_KNEE + i].y * 100 },
      ankle: { x: (1 - lms[L_ANKLE + i].x) * 100, y: lms[L_ANKLE + i].y * 100 },
    };
    return { sk, sample: { angle, confidence, aligned, t, keypoints } };
  }

  angle = angleAt(hip, pt(lms[L_KNEE + i]), pt(lms[L_ANKLE + i]));
  const sk: Skeleton = {
    shoulder: { x: (1 - shoulder.x) * 100, y: shoulder.y * 100 },
    elbow: { x: (1 - lms[L_ELBOW + i].x) * 100, y: lms[L_ELBOW + i].y * 100 },
    wrist: { x: (1 - lms[L_WRIST + i].x) * 100, y: lms[L_WRIST + i].y * 100 },
    hip: { x: (1 - hip.x) * 100, y: hip.y * 100 },
    knee: { x: (1 - lms[L_KNEE + i].x) * 100, y: lms[L_KNEE + i].y * 100 },
    ankle: { x: (1 - lms[L_ANKLE + i].x) * 100, y: lms[L_ANKLE + i].y * 100 },
  };
  return { sk, sample: { angle, confidence, aligned: true, t, keypoints } };
}
