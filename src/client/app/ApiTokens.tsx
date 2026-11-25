// Account › API tokens (work plan R5): make a token — a name, how long it lasts, whether it may change
// things, and which projects it reaches — copy it once, and revoke it. A token's reach is fixed when it is
// made (shared/apiTokens.ts); the list says what each one can do.
import { useState } from "react";

import { describeTokenReach, MAX_TOKEN_PROJECTS, TOKEN_ACCESS_NAMES, type TokenAccess } from "../../shared/apiTokens";
import { useAccountMutations, useTokens } from "../data/account";
import { Button } from "../design/core/Button";
import { copyIcon, copyText, type CopyState } from "../design/core/clipboard";
import { formatDate, formatRelative } from "../design/core/dates";
import { IconButton } from "../design/core/IconButton";
import { MenuHeading, MenuItem, MenuPopover } from "../design/core/Menu";
import { Select } from "../design/core/Select";
import { count } from "../design/core/text";
import { TextField } from "../design/core/TextField";
import { StatusDot, type SettingsGroup } from "../design/settings/SettingsShell";
import { quote, useFeedback } from "./feedback";
import "./apiTokens.css";

const EXPIRIES = [["30", "30 days"], ["90", "90 days"], ["180", "180 days"], ["365", "1 year"]].map(([value, label]) => ({ value: value!, label: label! }));
const ACCESS = (Object.entries(TOKEN_ACCESS_NAMES) as Array<[TokenAccess, string]>).map(([value, label]) => ({ value, label }));
const REACH = [{ value: "all", label: "All projects and the Inbox" }, { value: "some", label: "Only the projects I pick" }] as const;

export interface TokenProject {
  id: string;
  name: string;
  groupName: string;
}

export function useApiTokensSection(active: boolean, projects: TokenProject[]): SettingsGroup[] {
  const tokens = useTokens(active);
  const am = useAccountMutations();
  const notify = useFeedback((s) => s.notify);
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [access, setAccess] = useState<TokenAccess>("read");
  const [reach, setReach] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [secret, setSecret] = useState<{ value: string; copied: CopyState } | null>(null);
  const [now] = useState(() => new Date());
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name;
  // Projects left since they were picked drop out of the choice.
  const chosen = picked.filter((id) => projectName(id));
  const ready = !!name.trim() && (reach === "all" || chosen.length > 0);
  const toggle = (id: string) => setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < MAX_TOKEN_PROJECTS ? [...ids, id] : ids));
  const groups = [...new Set(projects.map((p) => p.groupName))];

  const create = () =>
    am.createToken.mutate(
      { name: name.trim(), days: Number(days), access, projectIds: reach === "some" ? chosen : null },
      {
        onSuccess: (t) => {
          setSecret({ value: t.secret, copied: "idle" });
          setName("");
          setPicked([]);
        },
      },
    );

  return [
    {
      id: "newtoken",
      title: "New token",
      fields: true,
      rows: [
        { id: "tokenName", label: "Token name", hint: "Where the token will be used, e.g. CI deploy", control: <TextField value={name} aria-label="Token name" placeholder="CI deploy" onChange={(e) => setName(e.target.value)} /> },
        { id: "tokenExpiry", label: "Expires", control: <Select aria-label="Expires" value={days} options={EXPIRIES} onChange={(v) => v && setDays(v)} placement="bottom-end" tier="detached" width={160} /> },
        { id: "tokenAccess", label: "Access", hint: access === "read" ? "It can look, but never change anything" : "It can change what you can change", control: <Select aria-label="Access" value={access} options={ACCESS} onChange={(v) => v && setAccess(v)} placement="bottom-end" tier="detached" width={200} /> },
        { id: "tokenReach", label: "Projects", hint: reach === "all" ? "Every project you're in, including ones you join later" : "Not your Inbox or your other projects", control: <Select aria-label="Projects" value={reach} options={REACH} onChange={(v) => v && setReach(v)} placement="bottom-end" tier="detached" width={240} /> },
        ...(reach === "some"
          ? [
              {
                id: "tokenProjects",
                label: chosen.length ? count(chosen.length, "project") : "No projects picked yet",
                hint: chosen.length ? chosen.map(projectName).join(", ") : "Pick the projects this token may reach",
                control: (
                  <MenuPopover label="Projects this token reaches" className="td-token-projects" tier="detached" minWidth={240} trigger={<Button icon="folder">Choose projects</Button>}>
                    {groups.map((g) => (
                      <div key={g} role="group" aria-label={g}>
                        <MenuHeading>{g}</MenuHeading>
                        {projects
                          .filter((p) => p.groupName === g)
                          .map((p) => (
                            <MenuItem key={p.id} role="menuitemcheckbox" checked={chosen.includes(p.id)} closeOnSelect={false} onSelect={() => toggle(p.id)}>
                              {p.name}
                            </MenuItem>
                          ))}
                      </div>
                    ))}
                  </MenuPopover>
                ),
              },
            ]
          : []),
        { id: "tokenCreate", label: "Create token", hint: "The token is shown once, right after you create it", control: <Button variant="primary" icon="plus" disabled={!ready} onClick={create}>Create token</Button> },
      ],
    },
    ...(secret
      ? [
          {
            id: "secret",
            title: "Copy your new token now",
            tone: "info" as const,
            rows: [
              {
                id: "secretValue",
                label: secret.value,
                mono: true,
                hint: secret.copied === "copied" ? "Copied. It won't be shown again." : secret.copied === "failed" ? "Couldn't copy. Select the token and copy it yourself; it won't be shown again." : "Copy it once — it won't be shown again",
                control: (
                  <>
                    <Button icon={copyIcon(secret.copied, "copy")} onClick={() => void copyText(secret.value).then((ok) => setSecret({ ...secret, copied: ok ? "copied" : "failed" }))}>{secret.copied === "copied" ? "Copied" : "Copy"}</Button>
                    <IconButton name="x" label="Dismiss" size={28} iconSize={16} onClick={() => setSecret(null)} />
                  </>
                ),
              },
            ],
          },
        ]
      : []),
    {
      id: "tokenlist",
      title: "Tokens",
      empty: "No tokens yet.",
      rows: (tokens.data ?? []).map((t) => {
        const expired = new Date(t.expiresAt) < now;
        const status = t.revokedAt ? "Revoked" : expired ? "Expired" : "Active";
        const when = expired ? `Expired ${formatRelative(t.expiresAt, now)}` : `Expires ${formatDate(t.expiresAt)}`;
        return {
          id: `tk-${t.id}`,
          label: t.name,
          hint: [describeTokenReach(t, projectName), `${t.prefix}…`, when, t.lastUsedAt ? `Last used ${formatRelative(t.lastUsedAt, now)}` : "Never used"].join(" · "),
          control: status === "Active" ? <Button icon="ban" onClick={() => am.revokeToken.mutate({ id: t.id }, { onSuccess: () => notify({ message: `Revoked the token ${quote(t.name)}`, icon: "ban" }) })}>Revoke</Button> : <StatusDot label={status} />,
        };
      }),
    },
  ];
}
