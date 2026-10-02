// What a route shows when it throws instead of the router's generic exception screen (DESIGN.md › States).
// Inside the app frame the shell stays usable and the page offers Retry and the Inbox; a session that could
// not be opened (the guest workspace is created on first visit) explains that and offers Try again and
// Log in. The underlying reason follows in a quieter line.
import { useNavigate, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { hasBrowserSession } from "../auth";
import { errorMessage } from "../data/api";
import { EmptyState } from "../design/core/EmptyState";
import "./screens.css";

function ErrorState({ title, hint, error, retry, secondary, page }: { title: string; hint: string; error: unknown; retry: () => void; secondary: { label: string; onClick: () => void }; page?: boolean }) {
  return (
    <div className="td-screen-canvas" style={page ? { minHeight: "100dvh", display: "grid" } : undefined}>
      <EmptyState tone="danger" icon="circle-alert" title={title} hint={hint} action={{ label: "Try again", icon: "refresh-cw", onClick: retry }} secondary={secondary}>
        <p className="td-empty-hint td-route-error-detail">{errorMessage(error)}</p>
      </EmptyState>
    </div>
  );
}

/** A screen failed to load or render: inside the app frame, or as a whole page (`page`). */
export function ScreenError({ error, reset, page }: ErrorComponentProps & { page?: boolean }) {
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <ErrorState
      page={page}
      title="This page couldn't be shown"
      hint="Something failed while loading it. Try again, or go to your Inbox."
      error={error}
      retry={() => {
        reset();
        void router.invalidate();
      }}
      secondary={{ label: "Go to Inbox", onClick: () => void navigate({ to: "/inbox", search: {} }) }}
    />
  );
}

/** The app frame's own start: the browser session (a guest workspace on first visit) could not be opened. */
export function SessionError(props: ErrorComponentProps) {
  const { error, reset } = props;
  const router = useRouter();
  const navigate = useNavigate();
  // With a session, the frame itself failed to render: that is a page error, not a sign-in problem.
  if (hasBrowserSession()) return <ScreenError {...props} page />;
  return (
    <ErrorState
      page
      title="Couldn't open your workspace"
      hint={navigator.onLine ? "Todoi didn't answer. Try again in a moment, or log in to an account." : "You're offline. Connect and try again."}
      error={error}
      retry={() => {
        reset();
        void router.invalidate();
      }}
      secondary={{ label: "Log in", onClick: () => void navigate({ to: "/login" }) }}
    />
  );
}
