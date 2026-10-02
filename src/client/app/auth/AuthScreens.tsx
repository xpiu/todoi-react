// The auth pages on Better Auth: log in, create an account, reset a password, and the invite landing.
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { authClient } from "../../auth";
import { api, unwrap, type InviteDetail } from "../../data/api";
import { InvitePage, type InviteState } from "../../design/auth/InvitePage";
import { ResetPasswordPage, type ResetStage } from "../../design/auth/ResetPasswordPage";
import { SignInPage } from "../../design/auth/SignInPage";
import { SignUpPage } from "../../design/auth/SignUpPage";
import { AuthShell, AuthState } from "../../design/auth/AuthShell";
import type { IconName } from "../../design/core/Icon";
import { ViewSkeleton } from "../../design/core/Skeleton";
import { avatarColorVar, useCurrentUser } from "../session";

const loginRoute = getRouteApi("/login");
const signupRoute = getRouteApi("/signup");
const inviteRoute = getRouteApi("/i/$code");

const safeNext = (next: string | undefined) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

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
        const r = await authClient.signIn.email({ email: e, password });
        setBusy(false);
        if (r.error) setError(r.error.message ?? "That email and password don't match.");
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
        const r = await authClient.signUp.email({ name, email: e, password });
        setBusy(false);
        if (r.error) setError(r.error.message ?? "Couldn't create the account.");
        else window.location.assign(safeNext(next));
      }}
      onLogin={() => navigate({ to: "/login", search: { next, email: email ?? undefined } })}
    />
  );
}

export function ResetScreen() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<ResetStage>("request");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        const r = await authClient.requestPasswordReset({ email: e, redirectTo: `${window.location.origin}/reset` });
        setBusy(false);
        if (r.error) setError(r.error.message ?? "Couldn't send the link.");
        else setStage("sent");
      }}
      onRequestAgain={() => setStage("request")}
      onBackToLogin={() => navigate({ to: "/login", search: {} })}
      onContinue={() => navigate({ to: "/" })}
    />
  );
}

export function InviteScreen() {
  const { code } = inviteRoute.useParams();
  const navigate = useNavigate();
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
  const openProject = () => navigate({ to: "/p/$projectId", params: { projectId: d.project.id }, search: {} });
  return (
    <InvitePage
      invite={{ project: { name: d.project.name, icon: d.project.icon as IconName | null, color: d.project.color ? `var(--label-${d.project.color})` : undefined, description: d.project.description }, groupName: d.groupName, itemCount: d.itemCount, memberCount: d.memberCount, inviter: d.inviter, role: d.invite.role, email: d.invite.email, expiresAt: d.invite.expiresAt }}
      state={state}
      signedIn={!!user && !user.isAnonymous}
      user={user && !user.isAnonymous ? { name: user.name, email: user.email, color: avatarColorVar(user.avatarColor) } : undefined}
      onAccept={async () => {
        const r = await api.api.invites[":code"].accept.$post({ param: { code } });
        if (r.ok) setAccepted(true);
      }}
      onDecline={() => navigate({ to: "/" })}
      onLogin={() => navigate({ to: "/login", search: { next: `/i/${code}`, email: d.invite.email ?? undefined } })}
      onCreateAccount={() => navigate({ to: "/signup", search: { next: `/i/${code}`, email: d.invite.email ?? undefined, invite: code } })}
      onSwitchAccount={() => void authClient.signOut().then(() => invite.refetch())}
      onOpenProject={openProject}
    />
  );
}
