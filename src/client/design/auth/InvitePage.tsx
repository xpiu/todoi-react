// InvitePage — what an invite link opens: the project first, "X invited you to join as Editor",
// then exactly the next step for this state (accept, log in to accept, or a closed state).
import { Avatar } from "../core/Avatar";
import { Button } from "../core/Button";
import { Icon, type IconName } from "../core/Icon";
import { AuthLink, AuthShell, AuthState } from "./AuthShell";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export interface InviteView {
  project: { name: string; icon?: IconName | null; color?: string; description?: string | null };
  groupName?: string | null;
  itemCount?: number;
  memberCount?: number;
  inviter?: string | null;
  role: string;
  email?: string | null;
  expiresAt?: string;
}
export type InviteState = "open" | "expired" | "revoked" | "member" | "accepted";

export interface InvitePageProps {
  invite: InviteView;
  state: InviteState;
  signedIn: boolean;
  user?: { name: string; email?: string; color?: string };
  onAccept?: () => void;
  onDecline?: () => void;
  onLogin?: () => void;
  onCreateAccount?: () => void;
  onSwitchAccount?: () => void;
  onOpenProject?: () => void;
}

export function InvitePage({ invite, state, signedIn, user, onAccept, onDecline, onLogin, onCreateAccount, onSwitchAccount, onOpenProject }: InvitePageProps) {
  const p = invite.project;
  const roleName = ROLE[invite.role] ?? invite.role;
  const meta = [invite.groupName, invite.itemCount != null ? `${invite.itemCount} item${invite.itemCount === 1 ? "" : "s"}` : null, invite.memberCount != null ? `${invite.memberCount} member${invite.memberCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
  const head = (
    <div className="td-auth-project">
      <span className="td-auth-tile">
        <Icon name={p.icon ?? "kanban"} size={20} color={p.color ?? "var(--ink-600)"} />
      </span>
      <span className="td-auth-pname">
        <b>{p.name}</b>
        {meta ? <span>{meta}</span> : null}
      </span>
    </div>
  );
  const closed = (icon: IconName, tone: "danger" | "success" | undefined, title: string, sub: React.ReactNode, action?: React.ReactNode) => (
    <AuthShell>
      {head}
      <AuthState icon={icon} tone={tone} title={title}>
        {sub}
      </AuthState>
      {action ? <div className="td-auth-stack">{action}</div> : null}
    </AuthShell>
  );
  if (state === "expired") return closed("clock", "danger", "This invite has expired", <>{invite.expiresAt ? `It stopped working on ${fmtDate(invite.expiresAt)}. ` : ""}Ask <b>{invite.inviter ?? "the person who sent it"}</b> for a new one.</>);
  if (state === "revoked") return closed("ban", "danger", "This invite was withdrawn", <>You'd need a new invite from <b>{invite.inviter ?? "a project admin"}</b>.</>);
  if (state === "member") return closed("circle-check", "success", "You're already a member", <>You have <b>{roleName}</b> access to this project.</>, onOpenProject ? <Button variant="primary" size="lg" onClick={onOpenProject}>Open project</Button> : null);
  if (state === "accepted") return closed("circle-check", "success", "You're in", <>You joined as <b>{roleName}</b>.</>, onOpenProject ? <Button variant="primary" size="lg" onClick={onOpenProject}>Open project</Button> : null);
  return (
    <AuthShell>
      {head}
      <h1 className="td-auth-title">
        <span>{invite.inviter ?? "Someone"}</span> invited you to join
      </h1>
      <p className="td-auth-sub">
        as <b>{roleName}</b>
        {invite.expiresAt ? ` · invite valid until ${fmtDate(invite.expiresAt)}` : ""}
      </p>
      {p.description ? <p className="td-auth-desc">{p.description}</p> : null}
      {signedIn && user ? (
        <>
          <div className="td-auth-who">
            <Avatar name={user.name} color={user.color} size={28} />
            <span className="td-auth-who-text">
              <b>Joining as {user.name}</b>
              {user.email ? <span>{user.email}</span> : null}
            </span>
            {onSwitchAccount ? <AuthLink label="Not you?" onClick={onSwitchAccount} /> : null}
          </div>
          <div className="td-auth-stack">
            <Button variant="primary" size="lg" onClick={onAccept}>
              Accept invite
            </Button>
            {onDecline ? (
              <Button variant="ghost" onClick={onDecline}>
                Decline
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="td-auth-stack">
            <Button variant="primary" size="lg" onClick={onLogin}>
              Log in to accept
            </Button>
            {onCreateAccount ? (
              <Button variant="outline" size="lg" onClick={onCreateAccount}>
                Create an account
              </Button>
            ) : null}
          </div>
          {invite.email ? <div className="td-auth-links is-center">The invite was sent to {invite.email}</div> : null}
        </>
      )}
    </AuthShell>
  );
}
