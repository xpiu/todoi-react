// MembersMenu — the Members action's panel: the roster with each member's role (a picker for admins),
// Invite people, the Visibility radio and the copyable project link. Body of a toolbar-tier Popover;
// the full roster (remove, invite form) stays in the project settings. Spec: DESIGN.md › Subnavbar.
import type { MemberRole, ProjectVisibility } from "../../../shared/enums";
import { Avatar } from "../core/Avatar";
import { Button } from "../core/Button";
import { COPY_FAILED, copyIcon, useCopy } from "../core/clipboard";
import { Icon } from "../core/Icon";
import { PopoverClose } from "../core/Popover";
import { Select } from "../core/Select";
import { PROJECT_VISIBILITY } from "../project/ProjectDialog";
import { PROJECT_ROLES, roleName, type PanelMember } from "../project/ProjectPanel";
import "./MembersMenu.css";

export interface MembersMenuProps {
  members: PanelMember[];
  currentUserId?: string;
  /** Admins and the owner change roles and visibility, and invite */
  canManage: boolean;
  visibility: ProjectVisibility;
  onVisibilityChange: (v: ProjectVisibility) => void;
  onChangeRole: (member: PanelMember, role: MemberRole) => void;
  /** Opens the project settings at Members, where the invite form is */
  onInvite?: () => void;
  url: string;
}

export function MembersMenu({ members, currentUserId, canManage, visibility, onVisibilityChange, onChangeRole, onInvite, url }: MembersMenuProps) {
  const [copied, copy] = useCopy();
  const vis = PROJECT_VISIBILITY.find((v) => v.value === visibility) ?? PROJECT_VISIBILITY[0]!;
  return (
    <div className="td-mm" data-visibility={vis.value}>
      <div className="td-mm-head">
        <Icon name="users" size={16} />
        <span className="td-mm-title">Members · {members.length}</span>
        <span className="td-mm-vis" title={vis.hint}>
          <Icon name={vis.icon} size={12} />
          {vis.label}
        </span>
      </div>
      <div className="td-mm-scroll">
        <div role="list" aria-label="Members">
          {members.map((m) => (
            <div key={m.id} className="td-mm-row" role="listitem">
              <Avatar name={m.name} color={m.color} size={28} />
              <span className="td-mm-name">
                <span className="td-mm-line">
                  {m.name}
                  {m.id === currentUserId ? " (you)" : ""}
                </span>
                {m.email ? <span className="td-mm-sub">{m.email}</span> : null}
              </span>
              {canManage && m.role !== "owner" ? (
                <span className="td-mm-rolepick">
                  <Select aria-label={`Role for ${m.name}`} variant="ghost" value={m.role} options={PROJECT_ROLES} onChange={(r) => onChangeRole(m, r)} placement="bottom-end" tier="toolbar" width={160} />
                </span>
              ) : (
                <span className="td-mm-role">{roleName(m.role)}</span>
              )}
            </div>
          ))}
        </div>
        {canManage && onInvite ? (
          <PopoverClose
            render={
              <button type="button" className="td-mm-row td-mm-act" onClick={onInvite}>
                <Icon name="user-plus" size={15} />
                <span className="td-mm-name">Invite people…</span>
              </button>
            }
          />
        ) : null}
        <div className="td-mm-sec" id="td-mm-vis-label">
          Visibility
        </div>
        <div role="radiogroup" aria-labelledby="td-mm-vis-label">
          {PROJECT_VISIBILITY.map((v) => (
            <button key={v.value} type="button" className="td-mm-row td-mm-act" role="radio" aria-checked={visibility === v.value} disabled={!canManage} onClick={() => visibility !== v.value && onVisibilityChange(v.value)}>
              <Icon name={v.icon} size={15} />
              <span className="td-mm-name">
                <span className="td-mm-line">{v.label}</span>
                <span className="td-mm-sub">{v.hint}</span>
              </span>
              {visibility === v.value ? <Icon name="check" size={15} color="var(--text-link)" /> : null}
            </button>
          ))}
        </div>
        {canManage ? null : <div className="td-mm-cap">Only admins can change roles or visibility.</div>}
        <div className="td-mm-sec">Project link</div>
        <div className="td-mm-link">
          <Icon name="link" size={14} />
          <input className="td-mm-url" readOnly tabIndex={-1} value={url} onClick={(e) => e.currentTarget.select()} aria-label="Project link" />
          <Button className="td-mm-copy" icon={copyIcon(copied, "copy")} title={copied === "failed" ? COPY_FAILED : undefined} onClick={() => void copy(url)}>
            {copied === "copied" ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
