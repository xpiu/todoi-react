// The QA pencil (shared/qa.ts): strokes as flat [x0, y0, x1, y1, …] viewport points, drawn 3px wide in
// bright red with round ends. Curves run through the midpoints between samples, so a fast hand gives a
// smooth line instead of corners. The colour is fixed, not a theme token: it has to stand out on every
// theme and reads the same in every screenshot.
import type { QaMarked } from "../../shared/qa";

export const INK_COLOR = "rgb(255, 31, 31)";
export const INK_WIDTH = 3;

export interface Stroke {
  /** Flat viewport coordinates in CSS pixels */
  points: number[];
  /** What the stroke touched when it was drawn (context.ts) */
  marked: QaMarked[];
}

type Pen = Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo" | "quadraticCurveTo" | "arc" | "stroke" | "fill" | "lineWidth" | "lineCap" | "lineJoin" | "strokeStyle" | "fillStyle">;

/** Add a sample unless the pointer barely moved (a still hand would pile up hundreds of equal points). */
export function addPoint(points: number[], x: number, y: number, minDistance = 0.75): boolean {
  const n = points.length;
  if (n >= 2 && Math.hypot(x - points[n - 2]!, y - points[n - 1]!) < minDistance) return false;
  points.push(x, y);
  return true;
}

/** One stroke: a dot for a click, otherwise a curve through the midpoints of its samples. */
export function drawStroke(pen: Pen, points: ReadonlyArray<number>) {
  if (points.length < 2) return;
  pen.beginPath();
  if (points.length === 2) {
    pen.arc(points[0]!, points[1]!, INK_WIDTH / 2, 0, Math.PI * 2);
    pen.fill();
    return;
  }
  pen.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length - 2; i += 2) {
    const x = points[i]!, y = points[i + 1]!;
    pen.quadraticCurveTo(x, y, (x + points[i + 2]!) / 2, (y + points[i + 3]!) / 2);
  }
  pen.lineTo(points[points.length - 2]!, points[points.length - 1]!);
  pen.stroke();
}

/** Every stroke, in the pencil's style. The caller sets the transform (CSS pixels to canvas pixels). */
export function drawStrokes(pen: Pen, strokes: ReadonlyArray<ReadonlyArray<number>>) {
  pen.lineWidth = INK_WIDTH;
  pen.lineCap = "round";
  pen.lineJoin = "round";
  pen.strokeStyle = INK_COLOR;
  pen.fillStyle = INK_COLOR;
  for (const points of strokes) drawStroke(pen, points);
}

/** Where a stroke points: the middle of its box (what a circle surrounds), then its end (where an arrow lands) and its start. */
export function probePoints(points: ReadonlyArray<number>): Array<[number, number]> {
  if (points.length < 2) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]!);
    maxX = Math.max(maxX, points[i]!);
    minY = Math.min(minY, points[i + 1]!);
    maxY = Math.max(maxY, points[i + 1]!);
  }
  const probes: Array<[number, number]> = [[(minX + maxX) / 2, (minY + maxY) / 2], [points[points.length - 2]!, points[points.length - 1]!], [points[0]!, points[1]!]];
  return probes.filter(([x, y], i) => probes.findIndex(([a, b]) => a === x && b === y) === i);
}
