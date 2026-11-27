// The screenshot of a QA note. A page cannot read its own pixels without the browser's screen-sharing
// prompt, so the DOM is re-rendered into an image instead (snapdom: a styled clone inside an SVG
// foreignObject, which the browser itself paints; allowed by the app's CSP, which lets images be data:
// URLs). That copy is what the pencil draws on, so what was marked is exactly what is sent. When the
// page cannot be rendered the note still goes out, with the drawing alone. Where the copy is visibly off,
// "Exact capture" takes the tab's real pixels instead, through that screen-sharing prompt (captureScreen).
import { snapdom } from "@zumer/snapdom";

import { drawStrokes } from "./ink";

export interface Frame {
  /** The viewport as an image; null when it could not be rendered */
  canvas: HTMLCanvasElement | null;
  /** Viewport size in CSS pixels when it was taken */
  width: number;
  height: number;
  ms: number;
  /** dom = re-rendered from the page (capturePage); screen = the tab's real pixels (captureScreen) */
  source: "dom" | "screen";
  error?: string;
}

/** Image pixels per CSS pixel: the display's own, but no more than 2 (a 3x phone-class shot is megabytes for nothing). */
export const captureScale = () => Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);

/**
 * Render what the viewport shows now, without `exclude` (the QA tool itself). Never throws. `reconcile`
 * has the renderer measure its copy against the live page and pin what differs: without it a table laid
 * out while a menu held the scroll lock came out with its columns elsewhere.
 */
export async function capturePage(exclude: string): Promise<Frame> {
  const started = performance.now();
  const width = window.innerWidth, height = window.innerHeight;
  const done = (canvas: HTMLCanvasElement | null, error?: string): Frame => ({ canvas, width, height, ms: Math.round(performance.now() - started), source: "dom", error });
  try {
    const scale = captureScale();
    const shot = await snapdom.toCanvas(document.documentElement, { clip: "viewport", scale, dpr: 1, embedFonts: true, reconcile: true, exclude, excludeMode: "remove" });
    // Exactly the viewport, whatever size the renderer settled on.
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")!.drawImage(shot, 0, 0, canvas.width, canvas.height);
    return done(canvas);
  } catch (error) {
    return done(null, (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 300));
  }
}

/** Whether this browser can share the tab's own pixels at all. */
export const canCaptureScreen = () => typeof navigator.mediaDevices?.getDisplayMedia === "function";

/** Declined in the browser's prompt: nothing went wrong, the person changed their mind. */
export const captureDeclined = (frame: Frame) => /^(NotAllowedError|AbortError)/.test(frame.error ?? "");

/**
 * The tab's real pixels, one frame of a screen share the person allows in the browser's prompt (Chrome
 * offers this tab first). `hide` takes the QA tool off the screen while the frame is read and puts it back.
 * Never throws: a declined prompt or another window than this one comes back as a frame without a canvas.
 */
export async function captureScreen(hide: (hidden: boolean) => void): Promise<Frame> {
  const started = performance.now();
  const width = window.innerWidth, height = window.innerHeight;
  const done = (canvas: HTMLCanvasElement | null, error?: string): Frame => ({ canvas, width, height, ms: Math.round(performance.now() - started), source: "screen", error });
  let stream: MediaStream | undefined;
  try {
    // preferCurrentTab and selfBrowserSurface are Chrome's hints to put "This tab" first; others ignore them.
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" } as DisplayMediaStreamOptions);
    hide(true);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    // A share that never plays must not leave the tool hidden: every wait here has an end.
    const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    await Promise.race([video.play(), pause(3000)]);
    // The share's first frames still show the tool and the prompt closing: let the page paint without them.
    await pause(400);
    if (!video.videoWidth || !video.videoHeight) return done(null, "The screen share gave no picture");
    // Another window or a whole screen is not this page: its shape gives it away.
    if (Math.abs(video.videoWidth / video.videoHeight - width / height) > 0.02) return done(null, "Choose this tab in the browser's prompt to capture it exactly");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    return done(canvas);
  } catch (error) {
    return done(null, (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 300));
  } finally {
    hide(false);
    for (const track of stream?.getTracks() ?? []) track.stop();
  }
}

/** The PNG that is sent: the frame (when there is one) with the strokes on top. */
export function composePng(frame: Frame, strokes: ReadonlyArray<ReadonlyArray<number>>): Promise<Blob> {
  const scale = frame.canvas ? frame.canvas.width / frame.width : captureScale();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(frame.width * scale);
  canvas.height = Math.round(frame.height * scale);
  const ctx = canvas.getContext("2d")!;
  if (frame.canvas) ctx.drawImage(frame.canvas, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawStrokes(ctx, strokes);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The screenshot could not be encoded"))), "image/png"));
}
