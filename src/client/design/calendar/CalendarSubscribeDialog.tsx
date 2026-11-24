// CalendarSubscribeDialog — "Subscribe to calendar": the private feed link with Copy, a three-step how-to
// per calendar app, Reset link (confirmed in place on its row), and the one-time .ics download as the
// secondary row. CalendarSubscribePanel is the body alone; the dialog puts it on the shared Dialog.
// Spec: DESIGN.md › Views › Calendar (Design: calendar/CalendarSubscribeDialog).
import { useId, useRef, useState } from "react";

import { copyIcon, useCopy } from "../core/clipboard";
import { Button } from "../core/Button";
import { Dialog, type DialogCloseReason } from "../core/Dialog";
import { Icon } from "../core/Icon";
import { InlineError } from "../core/InlineError";
import { Segmented } from "../core/Segmented";
import { Skeleton } from "../core/Skeleton";
import "../core/text.css";
import "./CalendarSubscribeDialog.css";

export type CalendarApp = "google" | "apple" | "outlook";

/** The three how-tos: id, short label (the segment), full name, three steps */
export const CALENDAR_APPS: ReadonlyArray<{ id: CalendarApp; label: string; name: string; steps: string[] }> = [
  { id: "google", label: "Google", name: "Google Calendar", steps: ["Open Google Calendar on a computer.", "Next to “Other calendars”, choose + and then “From URL”.", "Paste the link and choose “Add calendar”."] },
  { id: "apple", label: "Apple", name: "Apple Calendar", steps: ["On a Mac, choose File and then “New Calendar Subscription”. On an iPhone, open Settings, Calendar, Accounts, “Add Subscribed Calendar”.", "Paste the link.", "Choose “Subscribe”."] },
  { id: "outlook", label: "Outlook", name: "Outlook", steps: ["In Outlook on the web, open Calendar and choose “Add calendar”.", "Choose “Subscribe from web”.", "Paste the link and choose “Import”."] },
];

export interface CalendarSubscribePanelProps {
  /** Named in the first sentence; without it the sentence says what the feed holds across projects */
  projectName?: string;
  /** The private feed link. Empty while offline with nothing loaded. */
  url?: string;
  /** "loading": the link is being made (placeholder field, Copy disabled). "error": `error` + Retry. @default "ready" */
  state?: "ready" | "loading" | "error";
  /** Why the link could not be made (state="error") */
  error?: string;
  onRetry?: () => void;
  /** No connection: Reset and Download are disabled and say why; Copy still works for a link already on screen @default false */
  offline?: boolean;
  /** Hide the Reset row for people who may not reset the link @default true */
  canReset?: boolean;
  /** Confirmed "Reset link". The host swaps `url` when it succeeds and sets `justReset`. */
  onReset?: () => void;
  /** "busy" while the reset runs ("Resetting…") @default "idle" */
  resetState?: "idle" | "busy";
  /** The server's reason; shown as "Couldn't reset the link: …" and the button reads Retry */
  resetError?: string;
  /** Shows "New link created. Subscribe again in your calendar app." under the field */
  justReset?: boolean;
  /** Specimens: start on the confirm step */
  defaultResetConfirm?: boolean;
  /** Renders the "Download a copy" row */
  onDownload?: () => void;
  downloadState?: "idle" | "busy";
  downloadError?: string;
  /** Controlled how-to tab */
  app?: CalendarApp;
  /** @default "google" */
  defaultApp?: CalendarApp;
  onAppChange?: (app: CalendarApp) => void;
}

export function CalendarSubscribePanel({ projectName, url, state = "ready", error, onRetry, offline = false, canReset = true, onReset, resetState = "idle", resetError, justReset = false, defaultResetConfirm = false, onDownload, downloadState = "idle", downloadError, app: appProp, defaultApp = "google", onAppChange }: CalendarSubscribePanelProps) {
  const [copyState, copy] = useCopy();
  const [selfApp, setSelfApp] = useState<CalendarApp>(defaultApp);
  const [confirming, setConfirming] = useState(defaultResetConfirm);
  const app = CALENDAR_APPS.find((a) => a.id === (appProp ?? selfApp)) ?? CALENDAR_APPS[0]!;
  const urlRef = useRef<HTMLInputElement>(null);
  const ready = state === "ready" && !!url;
  const busy = resetState === "busy";
  // A finished reset leaves the confirm step.
  const settled = justReset && !busy;
  const [wasSettled, setWasSettled] = useState(settled);
  if (settled !== wasSettled) {
    setWasSettled(settled);
    if (settled) setConfirming(false);
  }
  const labelId = useId();
  const onCopy = () =>
    void copy(url!).then((ok) => {
      if (!ok) urlRef.current?.select();
    });
  return (
    <div className="td-calendar-subscribe">
      <p className="td-calendar-subscribe-intro">
        {/* One feed per person: it holds every project they're in and their Inbox, not only the open one */}
        {projectName ? (
          <>
            Items with a due date in <b>{projectName}</b>, your other projects and your Inbox
          </>
        ) : (
          "Items with a due date in your projects and your Inbox"
        )}{" "}
        show in your calendar app and follow your changes. Your calendar app decides how often it checks.
      </p>
      <div className="td-calendar-subscribe-label" id={labelId}>
        Private link
      </div>
      {state === "loading" ? (
        <div className="td-calendar-subscribe-link" aria-busy="true">
          <div className="td-calendar-subscribe-url is-loading">
            <Skeleton width="70%" height={12} />
            <span className="td-sr-only">Creating your link</span>
          </div>
          <Button variant="outline" icon="copy" disabled>
            Copy
          </Button>
        </div>
      ) : state === "error" ? (
        <div className="td-calendar-subscribe-failed">
          <InlineError message={error || "Couldn't create the link."} />
          {onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
        </div>
      ) : !url ? (
        <div className="td-calendar-subscribe-note">
          <Icon name="cloud-off" size={14} />
          <span>You're offline. The link shows when you reconnect.</span>
        </div>
      ) : (
        <div className="td-calendar-subscribe-link">
          {/* Read-only and selected on focus, so a refused copy can fall back to the person's own copy */}
          <input ref={urlRef} className="td-calendar-subscribe-url" readOnly value={url} aria-labelledby={labelId} onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
          <Button variant="outline" icon={copyIcon(copyState, "copy")} onClick={onCopy}>
            {copyState === "copied" ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      <InlineError message={copyState === "failed" ? "Couldn't copy. The link is selected, so you can copy it yourself." : null} />
      {justReset && ready ? (
        <div className="td-calendar-subscribe-status" role="status">
          <Icon name="check" size={14} color="var(--success-icon)" />
          New link created. Subscribe again in your calendar app.
        </div>
      ) : null}
      <div className="td-calendar-subscribe-note">
        <Icon name="lock" size={14} />
        <span>Anyone with this link can read these items' titles, dates and descriptions. Don't share it.</span>
      </div>
      <div className="td-calendar-subscribe-howto">
        <div className="td-calendar-subscribe-label">Add it to your calendar</div>
        <Segmented
          options={CALENDAR_APPS.map((a) => ({ id: a.id, label: a.label }))}
          value={app.id}
          onChange={(v) => {
            setSelfApp(v);
            onAppChange?.(v);
          }}
          size="sm"
          aria-label="Calendar app"
        />
      </div>
      <ol className="td-calendar-subscribe-steps" aria-label={`Steps for ${app.name}`}>
        {app.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className="td-calendar-subscribe-rows">
        {canReset && onReset ? (
          <div className="td-calendar-subscribe-row">
            {confirming ? (
              <>
                <div className="td-calendar-subscribe-text">
                  <b>Reset the link?</b>
                  <span>Calendars that use the current link stop updating. You subscribe again with the new link.</span>
                </div>
                <div className="td-calendar-subscribe-actions">
                  <Button variant="outline" disabled={busy || offline} onClick={onReset}>
                    {busy ? "Resetting…" : resetError ? "Retry" : "Reset link"}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="td-calendar-subscribe-text">
                  <b>Reset link</b>
                  <span>{offline ? "You're offline. Reset the link when you reconnect." : "Use this if the link was shared by mistake."}</span>
                </div>
                <Button variant="outline" disabled={offline || !ready} onClick={() => setConfirming(true)}>
                  Reset link
                </Button>
              </>
            )}
            <InlineError message={resetError ? `Couldn't reset the link: ${resetError}` : null} className="td-calendar-subscribe-wide" />
          </div>
        ) : null}
        {onDownload ? (
          <div className="td-calendar-subscribe-row">
            <div className="td-calendar-subscribe-text">
              <b>Download a copy</b>
              <span>{offline ? "You're offline. Download the file when you reconnect." : "A one-time .ics file with today's dates. It doesn't update."}</span>
            </div>
            <Button variant="outline" icon="download" disabled={offline || downloadState === "busy"} onClick={onDownload}>
              {downloadState === "busy" ? "Preparing…" : "Download .ics"}
            </Button>
            <InlineError message={downloadError ? `Couldn't prepare the file: ${downloadError}` : null} className="td-calendar-subscribe-wide" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface CalendarSubscribeDialogProps extends CalendarSubscribePanelProps {
  /** @default true */
  open?: boolean;
  /** Called with "escape" | "outside" | "close" */
  onClose?: (reason: DialogCloseReason) => void;
  /** @default 520 */
  width?: number | string;
}

export function CalendarSubscribeDialog({ open = true, onClose, width = 520, ...panel }: CalendarSubscribeDialogProps) {
  const doneRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={(reason) => onClose?.(reason)}
      width={width}
      title="Subscribe to calendar"
      initialFocus={doneRef}
      className="td-calendar-subscribe-dialog"
      footer={
        <Button ref={doneRef} variant="primary" onClick={() => onClose?.("close")}>
          Done
        </Button>
      }
    >
      <CalendarSubscribePanel {...panel} />
    </Dialog>
  );
}
