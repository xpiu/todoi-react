// The door to the QA note tool (shared/qa.ts): for a signed-in @todoi.com account, Ctrl+Shift+F shows or
// hides it on any screen, while typing and over any dialog. Everyone else gets no listener, and nobody
// downloads the tool (the drawing layer and the screenshot renderer) before first summoning it. The API
// decides who may really send a note (a confirmed address); this only keeps the tool out of the way.
import { lazy, Suspense, useEffect } from "react";

import { isStaffEmail } from "../../shared/qa";
import { useCurrentUser } from "../app/session";
import { SHORTCUTS } from "../design/core/shortcuts";
import { useQaNote } from "./store";

const QaTool = lazy(() => import("./QaTool"));

export function QaGate() {
  const { user } = useCurrentUser();
  const staff = !!user && !user.isAnonymous && isStaffEmail(user.email);
  const open = useQaNote((s) => s.open);
  useEffect(() => {
    if (!staff) return;
    // Capture phase on the window: before any field, menu or dialog can swallow the keys.
    const onKey = (e: KeyboardEvent) => {
      if (!SHORTCUTS.is("qa-note", e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) useQaNote.getState().toggle();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [staff]);
  if (!staff || !open) return null;
  return (
    <Suspense fallback={null}>
      <QaTool />
    </Suspense>
  );
}
