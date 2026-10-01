// GuestBar — the persistent read-only notice for people who can look but not edit: a public project
// opened without an account, or a Viewer inside one. One chrome row under the top bar; it never
// dismisses. The stylesheet carries the read-only contract: data-readonly="true" on the content
// wrapper hides every add / edit affordance. Spec: DESIGN.md › Guest.
import { Button } from "../core/Button";
import { Icon } from "../core/Icon";
import "./GuestBar.css";

export interface GuestBarProps {
  reason?: "public" | "viewer";
  projectName?: string;
  signedIn?: boolean;
  onLogin?: () => void;
  onRequestAccess?: () => void;
  onCreateAccount?: () => void;
  requested?: boolean;
}

export function GuestBar({ reason = "public", projectName, signedIn = false, onLogin, onRequestAccess, onCreateAccount, requested }: GuestBarProps) {
  const pub = reason === "public";
  const title = pub ? (signedIn ? "You're viewing this public project as a guest" : "Public project · read only") : "View only";
  const hint = pub ? (signedIn ? "Ask an admin for access to add or edit items." : "Log in to comment, or ask for access to edit.") : `You're a viewer in ${projectName ? `“${projectName}”` : "this project"}. Ask an admin for edit access.`;
  return (
    <div className="td-guest" role="status">
      <span className="td-guest-icon">
        <Icon name={pub ? "globe" : "eye"} size={16} />
      </span>
      <span className="td-guest-text">
        <b>{title}</b>
        <span>{hint}</span>
      </span>
      <span className="td-guest-actions">
        {onRequestAccess ? (
          <Button variant="chrome-ghost" icon={requested ? "check" : "user-plus"} disabled={!!requested} onClick={onRequestAccess}>
            {requested ? "Access requested" : "Ask for access"}
          </Button>
        ) : null}
        {!signedIn && onCreateAccount ? (
          <Button variant="chrome-ghost" onClick={onCreateAccount}>
            Create an account
          </Button>
        ) : null}
        {!signedIn && onLogin ? (
          <Button variant="chrome" icon="log-in" onClick={onLogin}>
            Log in
          </Button>
        ) : null}
      </span>
    </div>
  );
}
