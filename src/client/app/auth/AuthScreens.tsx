// The auth pages on Better Auth: log in, create an account, reset a password (request and the emailed
// link's landing), confirm an email address, and the invite landing.
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { authClient, forgetBrowserSession, syncGuestBeforeAuth } from "../../auth";
import { api, explain, unwrap, type InviteDetail } from "../../data/api";
import { InvitePage, type InviteState } from "../../design/auth/InvitePage";
import { ResetPasswordPage, type ResetStage } from "../../design/auth/ResetPasswordPage";
import { SignInPage } from "../../design/auth/SignInPage";
import { SignUpPage } from "../../design/auth/SignUpPage";
import { VerifyEmailPage } from "../../design/auth/VerifyEmailPage";
import { AuthShell, AuthState } from "../../design/auth/AuthShell";
import type { IconName } from "../../design/core/Icon";
import { ViewSkeleton } from "../../design/core/Skeleton";
import { avatarColorVar } from "../items";
import { useCurrentUser } from "../session";
import { useOpenProject } from "../useOpenProject";

const loginRoute = getRouteApi("/login");
const signupRoute = getRouteApi("/signup");
const inviteRoute = getRouteApi("/i/$code");
const resetRoute = getRouteApi("/reset");
const verifyRoute = getRouteApi("/verify-email");

const safeNext = (next: string | undefined) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

/** Log in with a password; a guest's queued changes sync first (they move to the account). Null, or why not. */
async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const syncError = await syncGuestBeforeAuth();
  if (syncError) return syncError;
  const r = await authClient.signIn.email({ email, password });
  return r.error ? (r.error.message ?? "That email and password don't match.") : null;
}

export function LoginScreen() {
  const { next, email } = loginRoute.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <SignInPage
      context={next && next !== "/" ? "Log in to continue where you left off." : undefined}
      defaultEmail={email ?? ""}
      error={error}
      busy={busy}
      onSignIn={async ({ email: e, password }) => {
        setBusy(true);
        setError(null);
        const failed = await signInWithPassword(e, password);
        setBusy(false);
        if (failed) setError(failed);
        else window.location.assign(safeNext(next));
      }}
      onForgotPassword={(e) => navigate({ to: "/reset", search: { email: e || undefined } })}
      onCreateAccount={() => navigate({ to: "/signup", search: { next, email: email ?? undefined } })}
    />
  );
}

export function SignupScreen() {
  const { next, email, invite } = signupRoute.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <SignUpPage
      context={invite ? "Create an account to accept the invite." : undefined}
      defaultEmail={email ?? ""}
      lockEmail={!!invite && !!email}
      error={error}
      busy={busy}
      onSignUp={async ({ name, email: e, password }) => {
        setBusy(true);
        setError(null);
        const syncError = await syncGuestBeforeAuth();
        if (syncError) { setError(syncError); setBusy(false); return; }
        const r = await authClient.signUp.email({ name, email: e, password });
        setBusy(false);
        if (r.error) setError(r.error.message ?? "Couldn't create the account.");
        else window.location.assign(safeNext(next));
      }}
      onLogin={() => navigate({ to: "/login", search: { next, email: email ?? undefined } })}
    />
  );
}

/** /reset: the request card, and the emailed link's landing (?token=…, or ?error=INVALID_TOKEN once used or expired). */
export function ResetScreen() {
  const search = resetRoute.useSearch();
  const navigate = useNavigate();
  const [stage, setStage] = useState<ResetStage>(search.token ? "new" : search.error ? "expired" : "request");
  const [email, setEmail] = useState(search.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restart = () => {
    setError(null);
    setStage("request");
    void navigate({ to: "/reset", search: { email: email || undefined }, replace: true });
  };
  return (
    <ResetPasswordPage
      stage={stage}
      email={email}
      busy={busy}
      error={error}
      onSend={async (e) => {
        setBusy(true);
        setError(null);
        setEmail(e);
        // The address rides along in the link, so the new-password card can name it and log in.
        const r = await authClient.requestPasswordReset({ email: e, redirectTo: `${window.location.origin}/reset?email=${encodeURIComponent(e)}` });
        setBusy(false);
        if (r.error) setError(r.error.message ?? "Couldn't send the link.");
        else setStage("sent");
      }}
      onSave={async ({ password, signOutOthers }) => {
        setBusy(true);
        setError(null);
        const r = await authClient.resetPassword({ newPassword: password, token: search.token ?? "" });
        if (r.error) {
          setBusy(false);
          if (r.error.code === "INVALID_TOKEN") setStage("expired");
          else setError(r.error.message ?? "Couldn't save the password.");
          return;
        }
        if (!email) {
          await navigate({ to: "/login", search: {} });
          return;
        }
        const failed = await signInWithPassword(email, password);
        if (!failed && signOutOthers) await authClient.revokeOtherSessions();
        setBusy(false);
        if (failed) await navigate({ to: "/login", search: { email } });
        else setStage("done");
      }}
      onRequestAgain={restart}
      onBackToLogin={() => navigate({ to: "/login", search: { email: email || undefined } })}
      onContinue={() => window.location.assign("/")}
    />
  );
}

/** /verify-email: Better Auth confirmed the address and sent the person here (?error=… when it couldn't). */
export function VerifyEmailScreen() {
  const { error } = verifyRoute.useSearch();
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  return (
    <VerifyEmailPage
      stage={!error ? "confirmed" : error === "TOKEN_EXPIRED" ? "expired" : "invalid"}
      email={user && !user.isAnonymous ? user.email : null}
      onContinue={() => window.location.assign("/")}
      onOpenAccount={() => navigate({ to: "/account", search: { s: "signin" } })}
    />
  );
}

export function InviteScreen() {
  const { code } = inviteRoute.useParams();
  const navigate = useNavigate();
  const openProject = useOpenProject();
  const { user } = useCurrentUser();
  const invite = useQuery({ queryKey: ["invite", code], queryFn: () => api.api.invites[":code"].$get({ param: { code } }).then((r) => unwrap<InviteDetail>(r)) });
  const [accepted, setAccepted] = useState(false);
  if (invite.isError)
    return (
      <AuthShell>
        <AuthState icon="ban" tone="danger" title="This invite link doesn't exist">
          Check the link you were sent, or ask for a new one.
        </AuthState>
      </AuthShell>
    );
  if (!invite.data) return <ViewSkeleton view="inbox" />;
  const d = invite.data;
  const state: InviteState = accepted ? "accepted" : (d.state as InviteState);
  return (
    <InvitePage
      key={code}
      invite={{ project: { name: d.project.name, icon: d.project.icon as IconName | null, color: d.project.color ? `var(--label-${d.project.color})` : undefined, description: d.project.description }, groupName: d.groupName, itemCount: d.itemCount, memberCount: d.memberCount, inviter: d.inviter, role: d.invite.role, email: d.invite.email, expiresAt: d.invite.expiresAt }}
      state={state}
      signedIn={!!user && !user.isAnonymous}
      user={user && !user.isAnonymous ? { name: user.name, email: user.email, color: avatarColorVar(user.avatarColor) } : undefined}
      onAccept={async () => {
        await api.api.invites[":code"].accept.$post({ param: { code } }).then((r) => unwrap(r)).catch(explain);
        setAccepted(true);
      }}
      onDecline={() => navigate({ to: "/" })}
      onLogin={() => navigate({ to: "/login", search: { next: `/i/${code}`, email: d.invite.email ?? undefined } })}
      onCreateAccount={() => navigate({ to: "/signup", search: { next: `/i/${code}`, email: d.invite.email ?? undefined, invite: code } })}
      onSwitchAccount={() => void authClient.signOut().then(() => {
        forgetBrowserSession();
        return invite.refetch();
      })}
      onOpenProject={() => openProject(d.project.id)}
      requested={d.requested}
      onRequestInvite={() => api.api.invites[":code"].request.$post({ param: { code } }).then((r) => unwrap(r)).catch(explain)}
    />
  );
}
