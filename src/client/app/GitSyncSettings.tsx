// Git sync in Settings and Account: one card per connected project, titled by the project (Storage & sync ›
// Synchronization: repository, sync state, recent syncs, sync settings), the projects that are not synced,
// the Storage row of Account › Projects, the Integrations list — and the dialogs they open (connect,
// resolve a conflict, replace the token, disconnect). Data: data/gitSync.ts.
// Spec: DESIGN.md › Storage & sync › Git sync.
import { useEffect, useState, type ReactNode } from "react";

import type { GitHubReturn } from "../../shared/gitSync";

import { errorMessage } from "../data/api";
import { continueWithGitHub, useGitConnections, useGitHubLink, useGitMutations, type GitConnectionView, type GitRunView } from "../data/gitSync";
import { Button } from "../design/core/Button";
import { Icon } from "../design/core/Icon";
import { relativeSync } from "../design/core/ConnectionStatus";
import { formatRelative } from "../design/core/dates";
import { ConfirmDialog, Dialog } from "../design/core/Dialog";
import { InlineError } from "../design/core/InlineError";
import { Select } from "../design/core/Select";
import { Switch } from "../design/core/Switch";
import { count } from "../design/core/text";
import { GitConflictDialog } from "../design/settings/GitConflictDialog";
import { GitConnectDialog, type GitCheckResult } from "../design/settings/GitConnectDialog";
import { MonoValue, StatusDot, type SettingsGroup, type SettingsRow } from "../design/settings/SettingsShell";
import { quote, useFeedback } from "./feedback";
import { fileSlug } from "./exportData";

interface ProjectLite {
  id: string;
  name: string;
  itemCount: number;
  role: string;
}

const POLICY_OPTIONS = [
  { value: "ask", label: "Ask me each time" },
  { value: "todoi", label: "todoi's version wins" },
  { value: "file", label: "The file's version wins" },
] as const;

/** A trip to GitHub that didn't end linked, in words for the connect dialog. */
const RETURN_NOTICES: Record<Exclude<GitHubReturn, "linked">, string> = {
  requested: "An owner of that organization has to approve todoi on GitHub. Continue again once they have",
  none: "todoi wasn't given a repository on GitHub. Continue, and choose at least one",
  denied: "Nothing was connected: the request was cancelled on GitHub",
  expired: "That took longer than GitHub's link lasts. Continue again",
  failed: "GitHub didn't confirm the link. Try again in a minute",
};
/** Back from GitHub: the project that was being connected and how the trip ended (the route's `connect` and `github`). */
export interface GitHubReturned {
  projectId?: string;
  outcome?: GitHubReturn;
  /** Take both out of the address, so a reload doesn't replay them */
  clear: () => void;
}

/** A state that needs attention: the glyph carries the tone, so it shows on every theme. */
function StateLabel({ tone, text }: { tone: "warn" | "danger"; text: string }) {
  return (
    <span className="td-git-state" data-tone={tone}>
      <Icon name="circle-alert" size={14} />
      {text}
    </span>
  );
}

/** One sync run as a sentence. */
export function runSentence(r: GitRunView): string {
  if (r.trigger === "connect") return r.outcome === "pulled" ? "Took the project from the file" : "Stored the project in the file";
  switch (r.outcome) {
    case "pushed":
      return r.pushed ? `Wrote ${count(r.pushed, "change")} to the file` : "Tidied the file";
    case "pulled":
      return `Brought in ${count(r.pulled, "change")} from the file`;
    case "merged":
      return `Merged ${count(r.pulled, "change")} in and ${count(r.pushed, "change")} out`;
    case "unchanged":
      return "Already in sync";
    case "conflict":
      return `Paused on ${count(r.conflicts, "conflict")}`;
    case "undone":
      return r.pushed ? `Undid a sync and wrote ${count(r.pushed, "change")} back to the file` : "Undid a sync. The file already matched";
    case "failed":
      return "Sync failed";
  }
}
const TRIGGER_WORDS: Record<GitRunView["trigger"], string> = { connect: "When connected", manual: "Synced by you", webhook: "After a push", auto: "On schedule", resolve: "After resolving a conflict", undo: "After an undo" };

export function useGitSyncSettings({ projects, currentProjectId, online, enabled, returned }: { projects: ProjectLite[]; currentProjectId: string | null; online: boolean; enabled: boolean; returned?: GitHubReturned }) {
  const connections = useGitConnections(enabled);
  const gm = useGitMutations();
  const notify = useFeedback((s) => s.notify);
  const [connectFor, setConnectFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const github = useGitHubLink(enabled && !!connectFor);
  // Back from GitHub: the dialog reopens where it was left, on the picker or on why there is none.
  const { projectId: returnedFor, outcome, clear } = returned ?? {};
  const arrival = returnedFor || outcome ? `${returnedFor} ${outcome}` : null;
  const [arrived, setArrived] = useState<string | null>(null);
  // Taken in while rendering, not in an effect: the dialog is open in the first paint.
  if (arrival && arrival !== arrived) {
    setArrived(arrival);
    if (returnedFor) setConnectFor(returnedFor);
    setNotice(outcome && outcome !== "linked" ? RETURN_NOTICES[outcome] : null);
  }
  // Then the address forgets it, so a reload doesn't replay the return.
  useEffect(() => {
    if (arrival) clear?.();
  }, [arrival, clear]);
  const [checked, setChecked] = useState<GitCheckResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictFor, setConflictFor] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [tokenFor, setTokenFor] = useState<string | null>(null);
  const [newToken, setNewToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [disconnectFor, setDisconnectFor] = useState<string | null>(null);
  const list = connections.data?.connections ?? [];
  const byProject = new Map(list.map((c) => [c.projectId, c]));
  const canAdmin = (projectId: string) => ["owner", "admin"].includes(projects.find((p) => p.id === projectId)?.role ?? "");

  const openConnect = (projectId: string) => {
    setChecked(null);
    setFormError(null);
    setNotice(null);
    setConnectFor(projectId);
  };
  const syncNow = (c: GitConnectionView) =>
    gm.sync.mutate(
      { projectId: c.projectId },
      {
        onSuccess: ({ run }) => {
          if (run.outcome === "conflict") setConflictFor(c.projectId);
          notify({ message: run.outcome === "failed" ? `Couldn't sync ${quote(c.projectName)}: ${run.error}` : `${quote(c.projectName)}: ${runSentence(run)}`, icon: run.outcome === "failed" || run.outcome === "conflict" ? "circle-alert" : "refresh-cw" });
        },
        onError: (err) => notify({ message: `Couldn't sync ${quote(c.projectName)}: ${errorMessage(err)}`, icon: "circle-alert" }),
      },
    );
  const undo = (c: GitConnectionView) =>
    gm.undo.mutate({ projectId: c.projectId }, { onSuccess: () => notify({ message: `Undid the last sync of ${quote(c.projectName)}. The file has todoi's version again`, icon: "undo-2" }), onError: (err) => notify({ message: `Couldn't undo: ${errorMessage(err)}`, icon: "circle-alert" }) });

  /** A connection's settings, for project owners and admins. */
  const syncSettingsRows = (c: GitConnectionView): SettingsRow[] => [
    { id: `gh-${c.projectId}-policy`, label: "When both sides change the same thing", hint: c.conflictPolicy === "ask" ? "Sync pauses until you pick a version" : "Decided without asking; the sync history says so", control: <Select aria-label="When both sides change the same thing" value={c.conflictPolicy} options={POLICY_OPTIONS} onChange={(v) => gm.update.mutate({ projectId: c.projectId, conflictPolicy: v }, { onError: (err) => notify({ message: `Couldn't save: ${errorMessage(err)}`, icon: "circle-alert" }) })} placement="bottom-end" tier="detached" width={240} /> },
    { id: `gh-${c.projectId}-auto`, label: "Sync on a schedule", hint: c.autoSync ? `Every 10 minutes${c.webhook ? ", and after each push" : ""}` : c.webhook ? "After each push, or when you press Sync now" : "Only when you press Sync now", control: <Switch aria-label="Sync on a schedule" checked={c.autoSync} onChange={(on) => gm.update.mutate({ projectId: c.projectId, autoSync: on }, { onError: (err) => notify({ message: `Couldn't save: ${errorMessage(err)}`, icon: "circle-alert" }) })} /> },
    // Through the GitHub App there is no token to keep: access is given and taken on GitHub.
    ...(c.via === "app" ? [] : [{ id: `gh-${c.projectId}-token`, label: "GitHub token", hint: `${c.tokenHint} · Replace it before it expires`, control: <Button icon="key-round" onClick={() => {
      setNewToken("");
      setTokenError(null);
      setTokenFor(c.projectId);
    }}>Replace token</Button> }]),
    { id: `gh-${c.projectId}-disconnect`, label: "Stop syncing", hint: "The file stays in the repository and the project stays in todoi", control: <Button icon="unplug" onClick={() => setDisconnectFor(c.projectId)}>Disconnect</Button> },
  ];
  /** One card per connected project, titled by the project: where the file lives, one state row with the action that state needs, the recent syncs, then its settings. */
  const panel = (c: GitConnectionView): SettingsGroup => {
    const paused = c.state === "conflict", failed = c.state === "error";
    const syncing = gm.sync.isPending && gm.sync.variables?.projectId === c.projectId;
    const runs = c.runs.slice(0, 5);
    const undoable = runs.find((r) => r.undoable);
    const [only] = c.conflicts.length === 1 ? c.conflicts : [];
    return {
      id: `gh-${c.projectId}`,
      title: c.projectName,
      sub: c.projectId === currentProjectId ? "Current project" : undefined,
      tone: paused || failed ? "danger" : c.stale ? "warn" : undefined,
      rows: [
        { id: `gh-${c.projectId}-repo`, label: "Repository", hint: `${c.branch} · ${c.path}${c.via === "app" ? " · through todoi's GitHub app" : ""}`, control: <MonoValue value={`${c.owner}/${c.repo}`} /> },
        {
          id: `gh-${c.projectId}-sync`,
          label: paused || failed || c.stale ? <StateLabel tone={c.stale && !paused && !failed ? "warn" : "danger"} text={paused ? `Paused · ${count(c.conflicts.length, "thing")} changed in both places` : failed ? "Last sync failed" : "Sync overdue"} /> : c.lastSyncedAt ? "In sync" : "Not synced yet",
          hint: paused
            ? only ? `${quote(only.title)} differs between todoi and the file. Pick a version to sync again` : "Pick a version for each to sync again"
            : failed
              ? (c.lastError ?? "Try again in a minute")
              : c.stale
                ? `${relativeSync(c.lastSyncedAt)} instead of every 10 minutes. Press Sync now to see why`
                : `${relativeSync(c.lastSyncedAt)} · ${c.webhook && c.autoSync ? "Syncs after each push and every 10 minutes" : c.webhook ? "Syncs after each push to GitHub" : c.autoSync ? "Syncs every 10 minutes" : "Press Sync now after pushing to GitHub"}`,
          control: paused ? (
            <Button variant="primary" icon="git-merge" onClick={() => setConflictFor(c.projectId)}>
              Resolve conflict
            </Button>
          ) : (
            <Button icon="refresh-cw" disabled={!online || syncing} onClick={() => syncNow(c)}>
              {syncing ? "Syncing…" : failed ? "Try again" : "Sync now"}
            </Button>
          ),
        },
        ...runs.map((r) => ({
          id: `gh-run-${r.id}`,
          label: runSentence(r),
          hint: [formatRelative(r.at), r.outcome === "undone" ? null : TRIGGER_WORDS[r.trigger], r.error, ...r.notes, r === undoable ? "Undo restores todoi to before this sync and updates the file" : null].filter(Boolean).join(" · "),
          control:
            r === undoable ? (
              <Button icon="undo-2" disabled={!online || gm.undo.isPending} onClick={() => undo(c)}>
                {gm.undo.isPending ? "Undoing…" : "Undo"}
              </Button>
            ) : undefined,
        })),
        ...(canAdmin(c.projectId) ? syncSettingsRows(c) : []),
      ],
    };
  };

  const ordered = [...list].sort((a, b) => Number(b.projectId === currentProjectId) - Number(a.projectId === currentProjectId) || a.projectName.localeCompare(b.projectName));
  const unset = projects.filter((p) => !byProject.has(p.id) && canAdmin(p.id));
  const storageGroups: SettingsGroup[] = [
    ...ordered.map(panel),
    ...(unset.length ? [{ id: "gh-unset", title: "Not synced", rows: unset.map((p) => ({ id: `gh-unset-${p.id}`, label: p.name, hint: "Only in todoi", control: <Button icon="git-branch" disabled={!online} onClick={() => openConnect(p.id)}>Connect</Button> })) }] : []),
  ];

  /** Account › Projects and storage: where one project's data lives. */
  const storageRow = (p: ProjectLite): SettingsRow => {
    const c = byProject.get(p.id);
    if (c) return { id: `pj-${p.id}-storage`, label: "Storage", hint: `todoi, synced with ${c.path} (${c.branch})`, control: <MonoValue value={`${c.owner}/${c.repo}`} /> };
    return { id: `pj-${p.id}-storage`, label: "Storage", hint: canAdmin(p.id) ? "Only in todoi. Connect a GitHub repository to sync it with a file" : "Only in todoi", control: canAdmin(p.id) ? <Button icon="git-branch" disabled={!online} onClick={() => openConnect(p.id)}>Connect repository</Button> : <MonoValue value="todoi database" /> };
  };

  const integrationGroups: SettingsGroup[] = [
    {
      id: "gh",
      title: "GitHub sync",
      rows: list.length
        ? list.map((c) => ({ id: `gh-int-${c.projectId}`, label: `${c.owner}/${c.repo}`, hint: `${c.projectName} · ${c.path}`, control: <StatusDot on={c.state === "ok"} label={c.state === "ok" ? "Connected" : c.state === "conflict" ? "Paused" : "Needs attention"} /> }))
        : [{ id: "ghNone", label: "No repositories connected", hint: "Sync a project with a file in a GitHub repository; set it up per project under Storage & sync" }],
    },
  ];

  const connectProject = projects.find((p) => p.id === connectFor);
  const conflictConn = conflictFor ? byProject.get(conflictFor) : undefined;
  const tokenConn = tokenFor ? byProject.get(tokenFor) : undefined;
  const disconnectConn = disconnectFor ? byProject.get(disconnectFor) : undefined;
  const dialogs: ReactNode = (
    <>
      <GitConnectDialog
        open={!!connectProject}
        onClose={() => setConnectFor(null)}
        projectName={connectProject?.name ?? ""}
        itemCount={connectProject?.itemCount ?? 0}
        defaultPath={`todo/${fileSlug(connectProject?.name ?? "project")}.md`}
        checked={checked}
        busy={gm.check.isPending || gm.connect.isPending}
        github={
          connections.data?.github.app
            ? {
                // Who they are on GitHub is known at once; what they can pick arrives a moment later.
                login: github.data ? github.data.login : connections.data.github.login,
                repos: github.data?.repos ?? [],
                more: github.data?.more,
                manageUrl: github.data?.manageUrl,
                loading: github.isPending,
                notice,
                // Come back to this page with the dialog open on this project.
                onContinue: () => continueWithGitHub(`${window.location.pathname}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(window.location.search)), connect: connectFor! })}`),
                onUnlink: () => gm.unlinkGitHub.mutate(undefined, { onError: (err) => setFormError(errorMessage(err)) }),
              }
            : undefined
        }
        error={formError ?? (github.isError ? errorMessage(github.error) : null)}
        offline={!online}
        onEdit={() => {
          setChecked(null);
          setFormError(null);
        }}
        onCheck={(t) => {
          setFormError(null);
          gm.check.mutate({ projectId: connectFor!, token: t.token, owner: t.owner, repo: t.repo, branch: t.branch, path: t.path }, { onSuccess: (r) => setChecked({ fullName: r.repo.fullName, private: r.repo.private, fileExists: r.fileExists }), onError: (err) => setFormError(errorMessage(err)) });
        }}
        onConnect={(t, mode) =>
          gm.connect.mutate(
            { projectId: connectFor!, ...t, mode },
            {
              onSuccess: ({ connection }) => {
                setConnectFor(null);
                notify({ message: mode === "use" ? `${quote(connection.projectName)} now syncs with ${connection.path}` : `Stored ${quote(connection.projectName)} in ${connection.owner}/${connection.repo}`, icon: "git-branch" });
              },
              onError: (err) => setFormError(errorMessage(err)),
            },
          )
        }
      />
      <GitConflictDialog
        open={!!conflictConn && conflictConn.conflicts.length > 0}
        onClose={() => {
          setConflictFor(null);
          setConflictError(null);
        }}
        repoName={conflictConn ? `${conflictConn.owner}/${conflictConn.repo}` : ""}
        conflicts={conflictConn?.conflicts ?? []}
        places={conflictConn?.places}
        busy={gm.sync.isPending}
        offline={!online}
        error={conflictError}
        onApply={(choices) =>
          gm.sync.mutate(
            { projectId: conflictFor!, choices },
            {
              onSuccess: ({ run }) => {
                if (run.outcome === "conflict") return setConflictError("More changes came in while you were choosing. Pick a version for the new ones too.");
                if (run.outcome === "failed") return setConflictError(run.error ?? "The sync failed");
                setConflictFor(null);
                notify({ message: `Conflict resolved. ${runSentence(run)}`, icon: "git-merge" });
              },
              onError: (err) => setConflictError(errorMessage(err)),
            },
          )
        }
      />
      <Dialog
        open={!!tokenConn}
        onClose={() => setTokenFor(null)}
        title="Replace GitHub token"
        width={440}
        footer={
          <>
            <Button variant="outline" onClick={() => setTokenFor(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={gm.update.isPending || !online} onClick={() => newToken.trim().length < 20 ? setTokenError(newToken.trim() ? "That's shorter than a GitHub token. Paste the whole token." : "Paste the new token from GitHub.") : gm.update.mutate({ projectId: tokenFor!, token: newToken.trim() }, { onSuccess: () => { setTokenFor(null); notify({ message: "Token replaced", icon: "key-round" }); }, onError: (err) => setTokenError(errorMessage(err)) })}>
              {gm.update.isPending ? "Saving…" : "Replace token"}
            </Button>
          </>
        }
      >
        <p className="td-account-text">The new token needs access to {tokenConn ? `${tokenConn.owner}/${tokenConn.repo}` : "the repository"} with Contents: Read and write. The current one stops being used at once.</p>
        <label className="td-account-label" htmlFor="td-git-new-token">New token</label>
        <input id="td-git-new-token" className="td-field td-git-mono" type="password" value={newToken} placeholder="github_pat_…" autoComplete="off" aria-invalid={tokenError ? true : undefined} onChange={(e) => { setNewToken(e.target.value); setTokenError(null); }} style={{ width: "100%" }} />
        <InlineError message={tokenError} />
      </Dialog>
      <ConfirmDialog
        open={!!disconnectConn}
        onClose={() => setDisconnectFor(null)}
        title={`Disconnect ${disconnectConn ? quote(disconnectConn.projectName) : "this project"}?`}
        body={disconnectConn ? `todoi stops syncing with ${disconnectConn.path} in ${disconnectConn.owner}/${disconnectConn.repo}. The file stays in the repository and the project stays in todoi; you can connect again later.` : ""}
        confirmLabel="Disconnect"
        danger
        busy={gm.disconnect.isPending}
        busyLabel="Disconnecting…"
        onConfirm={() => gm.disconnect.mutate({ projectId: disconnectFor! }, { onSuccess: () => { setDisconnectFor(null); notify({ message: `Disconnected ${quote(disconnectConn!.projectName)}`, icon: "unplug" }); }, onError: (err) => notify({ message: `Couldn't disconnect: ${errorMessage(err)}`, icon: "circle-alert" }) })}
      />
    </>
  );
  return { storageGroups, integrationGroups, storageRow, dialogs, openConnect, loading: connections.isLoading };
}
