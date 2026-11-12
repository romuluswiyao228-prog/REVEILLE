import { forwardRef } from "react";
import type { Skeleton } from "../lib/poseSim";

const LINKS: [keyof Skeleton, keyof Skeleton][] = [
  ["shoulder", "elbow"],
  ["elbow", "wrist"],
  ["shoulder", "hip"],
  ["hip", "knee"],
  ["knee", "ankle"],
];

const POINTS = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"] as const;

/**
 * Squelette SVG peint de façon impérative (attributs DOM) pour éviter
 * un re-render React à chaque frame. Utiliser paintSkeleton() dans la boucle.
 */
export const SkeletonLayer = forwardRef<SVGGElement>(function SkeletonLayer(_, ref) {
  return (
    <g ref={ref} style={{ display: "none" }}>
      {LINKS.map(([a, b]) => (
        <line key={a + b} strokeWidth={1.6} strokeLinecap="round" />
      ))}
      {POINTS.map((k) => (
        <circle key={k} r={k === "elbow" || k === "knee" ? 2.4 : 1.8} />
      ))}
    </g>
  );
});

/** Met à jour le squelette sans passer par React. sk=null => squelette masqué. */
export function paintSkeleton(g: SVGGElement | null, sk: Skeleton | null, color: string, opacity: number) {
  if (!g) return;
  if (!sk) {
    g.style.display = "none";
    return;
  }
  g.style.display = "";
  g.style.opacity = String(opacity);
  g.style.transition = "opacity .2s";
  const lines = g.querySelectorAll("line");
  LINKS.forEach(([a, b], i) => {
    const l = lines[i];
    if (!l) return;
    l.setAttribute("x1", String(sk[a].x));
    l.setAttribute("y1", String(sk[a].y));
    l.setAttribute("x2", String(sk[b].x));
    l.setAttribute("y2", String(sk[b].y));
    l.setAttribute("stroke", color);
  });
  const circles = g.querySelectorAll("circle");
  POINTS.forEach((k, i) => {
    const c = circles[i];
    if (!c) return;
    c.setAttribute("cx", String(sk[k].x));
    c.setAttribute("cy", String(sk[k].y));
    c.setAttribute("fill", k === "elbow" || k === "knee" ? "var(--accent)" : "#fff");
  });
}
