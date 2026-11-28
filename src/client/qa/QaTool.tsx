// The QA note tool (shared/qa.ts), loaded only for todoi's own people when they first summon it
// (QaGate.tsx). One layer over the whole app, in the browser's top layer so no dialog or menu covers it:
// a canvas the pencil draws on, and a small panel that can be dragged anywhere. In draw mode the canvas
// shows a still copy of the screen as it was when the mode began (capture.ts), so what is circled is what
// is sent, even if a menu under it closes meanwhile; "Use the app" lets everything through again to get
// the app into another state, keeping the drawing. The still is a re-rendering of the page; where it looks
// wrong, "Exact capture" replaces it with the tab's real pixels through the browser's screen-sharing prompt.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { MAX_QA_TEXT } from "../../shared/qa";
import { useCurrentUser } from "../app/session";
import { emailUnconfirmed, sendEmailConfirmation } from "../auth";
import { errorMessage } from "../data/api";
import { sendQaNote } from "../data/qaReports";
import { Button } from "../design/core/Button";
import { Icon } from "../design/core/Icon";
import { IconButton } from "../design/core/IconButton";
import { InlineError } from "../design/core/InlineError";
import { Segmented } from "../design/core/Segmented";
import { SHORTCUTS } from "../design/core/shortcuts";
import { TextField } from "../design/core/TextField";
import { canCaptureScreen, captureDeclined, capturePage, captureScreen, composePng, frameOutdated, type Frame } from "./capture";
import { collectContext, markedBy } from "./context";
import { addPoint, drawStrokes } from "./ink";
import { useQaNote, type QaMode } from "./store";
import "./qa.css";

const HOST_ID = "td-qa-root";
/** The panel's distance from the viewport edge, by default and at least */
const EDGE = 16;
/** How long the confirmation stays before the tool leaves */
const SENT_MS = 2200;
const MODES: ReadonlyArray<{ id: QaMode; label: string }> = [{ id: "draw", label: "Draw" }, { id: "use", label: "Use the app" }];

type Status = { kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string };

export default function QaTool() {
  const mode = useQaNote((s) => s.mode);
  const text = useQaNote((s) => s.text);
  const drawn = useQaNote((s) => s.strokes.length > 0);
  const close = useQaNote((s) => s.close);
  const setMode = useQaNote((s) => s.setMode);
  const setText = useQaNote((s) => s.setText);
  const undoStroke = useQaNote((s) => s.undoStroke);
  const clearStrokes = useQaNote((s) => s.clearStrokes);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const email = useCurrentUser().user?.email ?? "";

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  /** The still copy of the screen under the drawing (draw mode), and the capture that will replace it */
  const frameRef = useRef<Frame | null>(null);
  const pendingRef = useRef<Promise<Frame> | null>(null);
  /** The stroke under the pencil right now */
  const liveRef = useRef<number[] | null>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const focusedRef = useRef(false);
  const linkSentRef = useRef(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / window.innerWidth;
    const frame = frameRef.current;
    // At its own size from the top-left corner, never stretched: a stroke stays on what it was drawn on.
    if (frame?.canvas) ctx.drawImage(frame.canvas, 0, 0, frame.width * scale, frame.height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const strokes = useQaNote.getState().strokes.map((s) => s.points);
    drawStrokes(ctx, liveRef.current ? [...strokes, liveRef.current] : strokes);
  }, []);

  /** Take a new still of the screen; the newest one asked for wins. */
  const freeze = useCallback(() => {
    const run: Promise<Frame> = capturePage(`#${HOST_ID}`).then((frame) => {
      if (pendingRef.current === run) {
        pendingRef.current = null;
        frameRef.current = frame;
        paint();
      }
      return frame;
    });
    pendingRef.current = run;
    return run;
  }, [paint]);

  const place = useCallback((x: number, y: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    const next = { x: Math.round(Math.max(0, Math.min(x, window.innerWidth - box.width))), y: Math.round(Math.max(0, Math.min(y, window.innerHeight - box.height))) };
    positionRef.current = next;
    panel.style.setProperty("--td-qa-x", `${next.x}px`);
    panel.style.setProperty("--td-qa-y", `${next.y}px`);
  }, []);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    paint();
  }, [paint]);

  // Into the top layer, sized to the viewport, the panel in its corner (or where it was dragged last).
  useLayoutEffect(() => {
    const host = hostRef.current;
    const panel = panelRef.current;
    if (!host || !panel) return;
    try {
      host.showPopover?.();
    } catch {
      /* already shown, or no popover support: the stacking ladder's top rung in qa.css still applies */
    }
    fit();
    const box = panel.getBoundingClientRect();
    const saved = useQaNote.getState().position;
    place(saved?.x ?? window.innerWidth - box.width - EDGE, saved?.y ?? window.innerHeight - box.height - EDGE);
    // Its height changes with the error line: keep all of it on screen.
    const observer = new ResizeObserver(() => place(positionRef.current.x, positionRef.current.y));
    observer.observe(panel);
    return () => {
      observer.disconnect();
      try {
        host.hidePopover?.();
      } catch {
        /* not shown */
      }
    };
  }, [fit, place]);

  // Draw mode freezes the screen; the note field takes focus only after the first still, so a menu that
  // closes when focus leaves it is still in the picture.
  useEffect(() => {
    if (mode !== "draw") {
      frameRef.current = null;
      pendingRef.current = null;
      paint();
      return;
    }
    // An exact capture that switched to draw mode is the still already.
    if (frameRef.current?.source === "screen") return;
    let current = true;
    void freeze().then(() => {
      if (!current || focusedRef.current) return;
      focusedRef.current = true;
      fieldRef.current?.focus({ preventScroll: true });
    });
    return () => {
      current = false;
    };
  }, [mode, freeze, paint]);

  useEffect(() => useQaNote.subscribe((now, before) => now.strokes !== before.strokes && paint()), [paint]);

  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      fit();
      place(positionRef.current.x, positionRef.current.y);
      window.clearTimeout(timer);
      // A new still only when the old one stopped fitting (sharing a tab fires resizes of its own).
      if (useQaNote.getState().mode === "draw") timer = window.setTimeout(() => (!frameRef.current || frameOutdated(frameRef.current)) && void freeze(), 200);
    };
    // The still must not slide under the pencil: the wheel does nothing while drawing.
    const canvas = canvasRef.current;
    const onWheel = (e: WheelEvent) => e.preventDefault();
    window.addEventListener("resize", onResize);
    canvas?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("resize", onResize);
      canvas?.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [fit, freeze, place]);

  const onInkDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    liveRef.current = [e.clientX, e.clientY];
    paint();
  };
  const onInkMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current;
    if (!live) return;
    // Every sample the browser merged into this event: a fast hand stays a curve.
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const p of samples.length ? samples : [e.nativeEvent]) addPoint(live, p.clientX, p.clientY);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
  };
  const onInkUp = () => {
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = null;
    useQaNote.getState().addStroke({ points: live, marked: markedBy(live, hostRef.current) });
  };

  const onHeadDown = (e: ReactPointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (e.button !== 0 || !panel || (e.target as Element).closest("button")) return;
    const box = panel.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeadMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current) place(e.clientX - dragRef.current.dx, e.clientY - dragRef.current.dy);
  };
  const onHeadUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    useQaNote.getState().moveTo(positionRef.current);
  };

  /** Swap the still for the tab's real pixels (the browser asks first); the drawing stays. */
  const captureExactly = async () => {
    const host = hostRef.current;
    if (!host) return;
    // The tool leaves the screen for the shot. The mouse pointer does not: a tab share paints it into the
    // picture wherever it rests, and Chrome has no option to leave it out (its `cursor` setting is fixed).
    const frame = await captureScreen((hidden) => host.classList.toggle("is-hidden", hidden));
    if (!frame.canvas) {
      if (!captureDeclined(frame)) setStatus({ kind: "error", message: `Exact capture didn't work. ${frame.error ?? ""}`.trim() });
      return;
    }
    pendingRef.current = null;
    frameRef.current = frame;
    setStatus({ kind: "idle" });
    setMode("draw");
    paint();
    // Back to the note: the click on the button and the browser's prompt took the focus away.
    fieldRef.current?.focus({ preventScroll: true });
  };

  /** The API wants the sign-in address confirmed first: send its link (once), which comes back to this page. The note stays. */
  const confirmFirst = async () => {
    linkSentRef.current ||= await sendEmailConfirmation(email, window.location.pathname + window.location.search).then((r) => !r.error, () => false);
    return linkSentRef.current ? `Confirm your email address first. We sent a link to ${email}: open it, then submit again.` : "Confirm your email address first. Send the link from Settings › Notifications, then submit again.";
  };

  const submit = async () => {
    const note = useQaNote.getState();
    if (status.kind === "sending" || status.kind === "sent") return;
    if (!note.text.trim() && !note.strokes.length) {
      setStatus({ kind: "error", message: "Write what is wrong, or draw on the screen." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      // The still the drawing was made on; in "Use the app" there is none, so the screen as it is now.
      const frame = frameRef.current ?? (await (pendingRef.current ?? capturePage(`#${HOST_ID}`)));
      const screenshot = await composePng(frame, note.strokes.map((s) => s.points));
      await sendQaNote({ text: note.text.trim(), context: collectContext(note.strokes, frame), screenshot });
      // Sent is sent: the draft goes now, so hiding the tool in the next second cannot leave it to be sent twice.
      note.reset();
      setStatus({ kind: "sent" });
    } catch (error) {
      setStatus({ kind: "error", message: emailUnconfirmed(error) ? await confirmFirst() : errorMessage(error) });
    }
  };

  // The confirmation shows for a moment, then the tool leaves.
  useEffect(() => {
    if (status.kind !== "sent") return;
    const timer = window.setTimeout(close, SENT_MS);
    return () => window.clearTimeout(timer);
  }, [status.kind, close]);

  const onKeyDown = (e: KeyboardEvent) => {
    // Typing a note is not using the app: its shortcuts never see these keys.
    e.stopPropagation();
    if (SHORTCUTS.is("close", e)) {
      e.preventDefault();
      close();
    } else if (SHORTCUTS.is("save-close", e)) {
      e.preventDefault();
      void submit();
    }
  };

  const busy = status.kind === "sending" || status.kind === "sent";
  return (
    <div ref={hostRef} id={HOST_ID} className="td-qa" popover="manual" data-mode={mode}>
      <canvas ref={canvasRef} className="td-qa-ink" aria-hidden="true" onPointerDown={onInkDown} onPointerMove={onInkMove} onPointerUp={onInkUp} onPointerCancel={onInkUp} onMouseDown={(e) => e.preventDefault()} />
      <section ref={panelRef} className="td-qa-panel" role="dialog" aria-label="QA note" onKeyDown={onKeyDown}>
        <header className="td-qa-head" onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp} onPointerCancel={onHeadUp}>
          <h2 className="td-qa-title">QA note</h2>
          <IconButton name="x" label="Close" size={24} onClick={close} />
        </header>
        {/* The form and the confirmation share one cell: the panel keeps its size when the note is sent. */}
        <div className="td-qa-body">
          <div className="td-qa-form" inert={status.kind === "sent"}>
          <div className="td-qa-tools">
            <Segmented aria-label="Pointer" size="sm" stretch options={MODES} value={mode} onChange={setMode} disabled={busy} />
            {canCaptureScreen() ? <IconButton name="camera" label="Capture the screen exactly" tooltip="Exact capture" tooltipSide="top" size={24} disabled={busy} onClick={() => void captureExactly()} /> : null}
            <IconButton name="undo-2" label="Undo the last stroke" tooltip="Undo stroke" tooltipSide="top" size={24} disabled={!drawn || busy} onClick={undoStroke} />
            <IconButton name="trash-2" label="Clear the drawing" tooltip="Clear drawing" tooltipSide="top" size={24} disabled={!drawn || busy} onClick={clearStrokes} />
          </div>
          <TextField
            multiline
            ref={fieldRef}
            rows={4}
            className="td-qa-text"
            aria-label="What is wrong"
            placeholder="What's wrong here?"
            maxLength={MAX_QA_TEXT}
            value={text}
            readOnly={busy}
            onChange={(e) => {
              setText(e.target.value);
              if (status.kind === "error") setStatus({ kind: "idle" });
            }}
          />
          <InlineError message={status.kind === "error" ? status.message : null} />
          <footer className="td-qa-foot">
            <span className="td-qa-status" role="status">
              {status.kind === "sending" ? "Sending…" : ""}
            </span>
            <Button variant="primary" disabled={busy} onClick={() => void submit()}>
              Submit
            </Button>
          </footer>
          </div>
          <div className="td-qa-sent" role="status">
            {status.kind === "sent" ? (
              <>
                {/* The theme's own Done mark, enlarged: Rounded's green disc, Minimal's ink box (qa.css · minimal-components.css). */}
                <span className="td-qa-sent-mark" aria-hidden="true">
                  <Icon name="check" size={24} strokeWidth={3} />
                </span>
                <p className="td-qa-sent-title">Note sent</p>
                <p className="td-qa-sent-hint">Screenshot and page details included.</p>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
