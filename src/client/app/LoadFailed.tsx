// LoadFailed — a failed load with nothing cached: the danger EmptyState with Retry and Details, and where to get help.
// Spec: DESIGN.md › States (situation table).
import { useState } from "react";

import { EmptyState } from "../design/core/EmptyState";

export function LoadFailed({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  const [details, setDetails] = useState(false);
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="td-screen-canvas">
      <EmptyState tone="danger" icon="cloud-off" title={`We could not load ${what}`} hint={details ? message : "Please check the connection and try again."} action={{ label: "Retry", icon: "refresh-cw", onClick: onRetry }} secondary={{ label: details ? "Hide details" : "Details", onClick: () => setDetails((d) => !d) }} footer={<>If the issue persists, please <a href="https://todoi.com/contact" target="_blank" rel="noreferrer">contact</a> us.</>} />
    </div>
  );
}
