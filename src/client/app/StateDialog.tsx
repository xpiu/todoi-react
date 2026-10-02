// StateDialog — a dialog that explains why something asked for cannot show yet: still loading (placeholder
// lines after the skeleton delay), failed (Retry), or not available (a way on). Close always works. Used where a link or
// a menu opens a dialog-sized surface whose data is missing. Spec: DESIGN.md › States.
import { useEffect, useState } from "react";

import { Button } from "../design/core/Button";
import { Dialog } from "../design/core/Dialog";
import { InlineError } from "../design/core/InlineError";
import { Skeleton, SKELETON_DELAY_MS } from "../design/core/Skeleton";

export interface StateDialogProps {
  title: string;
  /** A sentence, or "pending" for placeholder lines */
  body: string;
  action?: { label: string; onClick: () => void } | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
}

export function StateDialog({ title, body, action, busy, error, onClose }: StateDialogProps) {
  return (
    <Dialog
      open
      title={title}
      width={440}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} autoFocus={!action}>
            Close
          </Button>
          {action ? (
            <Button variant="primary" onClick={action.onClick} disabled={busy} autoFocus>
              {action.label}
            </Button>
          ) : null}
        </>
      }
    >
      {body === "pending" ? <PendingLines /> : <p className="td-confirm-body">{body}</p>}
      <InlineError message={error} />
    </Dialog>
  );
}

/** Nothing for the first moment (the skeleton delay), so a quick answer never flashes; then two placeholder lines. */
function PendingLines() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="td-confirm-body" aria-busy="true">
      {shown ? (
        <>
          <Skeleton width="70%" />
          <Skeleton width="45%" style={{ marginTop: 8 }} />
        </>
      ) : null}
    </div>
  );
}
