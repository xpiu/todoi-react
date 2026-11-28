// GitConnectDialog — connect a project to a file in a GitHub repository, in two stages on the shared
// Dialog: "form" (repository, branch, file and format, how conflicts are decided) → "checked" (what todoi
// found: the repository, and whether the file is already there, which decides the one thing connecting
// can do — store the project as a new file, or let the existing file become the project).
// With a GitHub App on the server (`github`), the form opens on one button, Continue with GitHub; back
// from GitHub, Repository is a picker of what the app was given and no token is asked. "Use a token
// instead" (and a server without the app) keeps the pasted fine-grained token, where a pasted GitHub link
// fills the repository, branch and file. Pure: the host checks, connects and leaves for GitHub.
// Spec: DESIGN.md › Storage & sync › Git sync.
import { useRef, useState } from "react";

import { formatForPath, parseRepoInput, type GitHubRepoView } from "../../../shared/gitSync";
import type { FileFormat } from "../../../shared/projectDoc/codecs";
import { Button } from "../core/Button";
import type { DialogCloseReason } from "../core/Dialog";
import { InlineError } from "../core/InlineError";
import { Segmented } from "../core/Segmented";
import { Select } from "../core/Select";
import { FlowFrame, FlowState } from "./accountFlow";
import "./GitSync.css";

export type ConflictPolicy = "ask" | "todoi" | "file";
export interface GitTarget {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  format: FileFormat;
  /** Absent: through the GitHub App */
  token?: string;
  conflictPolicy: ConflictPolicy;
}
/** The GitHub App's side of the dialog, when the server has one. */
export interface GitHubLink {
  /** The person's GitHub name once they continued with GitHub; null before */
  login: string | null;
  repos: ReadonlyArray<GitHubRepoView>;
  /** There are more repositories than listed */
  more?: boolean;
  /** GitHub's page where the app is given more repositories */
  manageUrl?: string | null;
  loading?: boolean;
  /** How the last trip to GitHub ended, when it didn't end linked ("An owner has to approve…") */
  notice?: string | null;
  /** Leave for GitHub to authorize (and install) the app */
  onContinue: () => void;
  /** Forget the link, to continue as another GitHub account */
  onUnlink?: () => void;
}
export interface GitCheckResult {
  fullName: string;
  private: boolean;
  fileExists: boolean;
}

export interface GitConnectDialogProps {
  open: boolean;
  onClose: (reason: DialogCloseReason) => void;
  projectName: string;
  /** Items in the project now, for the "replaces" and "stores" sentences */
  itemCount: number;
  /** The file a new connection suggests, e.g. "todo/website.md" */
  defaultPath: string;
  /** What the host's check found for the current values; null until checked */
  checked?: GitCheckResult | null;
  /** Check the repository, branch and file with the token */
  onCheck?: (target: GitTarget) => void;
  /** Connect: "store" when the file isn't there, "use" when it is */
  onConnect?: (target: GitTarget, mode: "store" | "use") => void;
  /** Values changed after a check: the host forgets it */
  onEdit?: () => void;
  busy?: boolean;
  /** The GitHub App, when the server has one; absent, connecting takes a token */
  github?: GitHubLink;
  /** The server's reason, shown under the form */
  error?: string | null;
  offline?: boolean;
}

const FORMATS: ReadonlyArray<{ id: FileFormat; label: string; ext: string }> = [
  { id: "embridge", label: "Markdown", ext: ".md" },
  { id: "json", label: "JSON", ext: ".json" },
  { id: "yaml", label: "YAML", ext: ".yaml" },
];
const POLICIES: ReadonlyArray<{ value: ConflictPolicy; label: string }> = [
  { value: "ask", label: "Ask me each time" },
  { value: "todoi", label: "todoi's version wins" },
  { value: "file", label: "The file's version wins" },
];
/** GitHub's page for a new fine-grained token, with a name and the one permission sync needs. */
export const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new?name=todoi%20sync&description=Keeps%20todoi%20projects%20in%20sync%20with%20files%20in%20this%20repository&contents=write";

export function GitConnectDialog({ open, onClose, projectName, itemCount, defaultPath, checked, onCheck, onConnect, onEdit, busy = false, github, error, offline = false }: GitConnectDialogProps) {
  const [repoText, setRepoText] = useState("");
  // null: the branch follows the picked repository's default.
  const [branchText, setBranch] = useState<string | null>(null);
  const [byToken, setByToken] = useState(false);
  const [path, setPath] = useState(defaultPath);
  const [format, setFormat] = useState<FileFormat>("embridge");
  const [token, setToken] = useState("");
  const [policy, setPolicy] = useState<ConflictPolicy>("ask");
  const [touched, setTouched] = useState(false);
  // A fresh form each time the dialog opens (reset while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setRepoText("");
      setBranch(null);
      setByToken(false);
      setPath(defaultPath);
      setFormat("embridge");
      setToken("");
      setPolicy("ask");
      setTouched(false);
    }
  }
  const repoRef = useRef<HTMLInputElement>(null);
  const viaApp = !!github && !byToken;
  const pickable = github?.repos.filter((r) => r.canPush) ?? [];
  // The one repository the app was given needs no picking.
  const picked = viaApp ? (github.repos.find((r) => r.fullName === repoText) ?? (pickable.length === 1 && !repoText ? pickable[0] : undefined)) : undefined;
  const repo = parseRepoInput(viaApp ? (picked?.fullName ?? "") : repoText);
  const branch = branchText ?? picked?.defaultBranch ?? "main";
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    onEdit?.();
  };
  // A pasted link to a file fills the rest.
  const changeRepo = (v: string) => {
    setRepoText(v);
    onEdit?.();
    const parsed = parseRepoInput(v);
    if (parsed?.branch) setBranch(parsed.branch);
    const f = parsed?.path ? formatForPath(parsed.path) : null;
    if (parsed?.path && f) {
      setPath(parsed.path);
      setFormat(f);
    }
  };
  const changeFormat = (f: FileFormat) => {
    setFormat(f);
    onEdit?.();
    // The extension follows the format.
    setPath((p) => p.replace(/\.(md|markdown|json|ya?ml)$/i, "") + FORMATS.find((x) => x.id === f)!.ext);
  };
  const problems = {
    repo: viaApp ? (repo ? null : "Pick the repository.") : !repoText.trim() ? "Enter the repository, like acme/plans, or paste its GitHub link." : !repo ? "Use owner/repository, like acme/plans." : null,
    branch: !branch.trim() ? "Name the branch, like main." : null,
    path: !path.trim() ? "Name the file, like todo/website.md." : formatForPath(path) !== format ? `End the file name in ${FORMATS.find((x) => x.id === format)!.ext} for ${FORMATS.find((x) => x.id === format)!.label}.` : null,
    token: viaApp ? null : !token.trim() ? "Paste the token from GitHub." : token.trim().length < 20 ? "That's shorter than a GitHub token. Paste the whole token." : null,
  };
  const show = (k: keyof typeof problems) => (touched ? problems[k] : null);
  const valid = !Object.values(problems).some(Boolean);
  const target = (): GitTarget => ({ owner: repo!.owner, repo: repo!.repo, branch: branch.trim(), path: path.trim(), format, ...(viaApp ? {} : { token: token.trim() }), conflictPolicy: policy });
  const check = () => {
    setTouched(true);
    if (valid && !busy && !offline) onCheck?.(target());
  };
  const mode = checked?.fileExists ? "use" : "store";
  const lost = offline ? "You're offline. Reconnect to the internet to reach GitHub." : error ?? null;
  const writer = viaApp ? "todoi's GitHub app" : "The token";
  const switchWay = (toToken: boolean) => {
    setByToken(toToken);
    setRepoText("");
    setBranch(null);
    setTouched(false);
    onEdit?.();
  };
  const intro = (
    <p className="td-account-text">
      Keep <b>{projectName}</b> in a file in a GitHub repository. Edits in todoi and in the file sync both ways.
    </p>
  );

  // Nothing to pick yet (not linked, or linked with no repository to write to): one way forward, and the
  // token as the quiet other one.
  if (viaApp && !checked && (!github.login || (!github.repos.length && !github.loading)))
    return (
      <FlowFrame
        open={open}
        onClose={onClose}
        title="Connect a repository"
        width={520}
        footerLead={
          <>
            {github.login && github.onUnlink ? (
              <>
                GitHub: {github.login} ·{" "}
                <button type="button" className="td-git-link" onClick={github.onUnlink}>
                  Switch account
                </button>{" "}
                ·{" "}
              </>
            ) : null}
            <button type="button" className="td-git-link" onClick={() => switchWay(true)}>
              Use a token instead
            </button>
          </>
        }
        footer={
          <>
            <Button variant="outline" onClick={() => onClose("cancel")}>
              Cancel
            </Button>
            <Button variant="primary" icon="git-branch" disabled={offline || github.loading} onClick={github.onContinue}>
              Continue with GitHub
            </Button>
          </>
        }
      >
        {intro}
        {github.notice ? (
          <FlowState icon="circle-alert" title={github.notice} />
        ) : github.login ? (
          <FlowState icon="circle-alert" title="todoi hasn't been given a repository you can write to">
            {github.manageUrl ? (
              <>
                <a className="td-git-link" href={github.manageUrl} target="_blank" rel="noreferrer">
                  Choose repositories on GitHub
                </a>
                ; they show up here when you come back.
              </>
            ) : null}
          </FlowState>
        ) : (
          <p className="td-account-text">On GitHub you choose which repositories todoi may use. It reads and writes files in those, and nothing else.</p>
        )}
        <InlineError message={lost} />
      </FlowFrame>
    );

  if (checked)
    return (
      <FlowFrame
        open={open}
        onClose={onClose}
        title="Ready to connect"
        width={520}
        footer={
          <>
            <Button variant="outline" onClick={() => onEdit?.()}>
              Back
            </Button>
            <Button variant={mode === "use" && itemCount ? "danger" : "primary"} icon={mode === "use" ? "file-search-2" : "file-plus-2"} disabled={busy || offline} onClick={() => onConnect?.(target(), mode)}>
              {busy ? "Connecting…" : mode === "use" ? "Replace with file" : "Store new file"}
            </Button>
          </>
        }
      >
        <FlowState icon="git-branch" title={`${checked.fullName} · ${branch.trim()}`}>
          {checked.private ? `Private repository. ${writer} can write to it.` : `${writer} can write to it.`}
        </FlowState>
        {checked.private ? null : (
          <FlowState icon="circle-alert" tone="danger" title="This repository is public">
            Anyone can read the file, with every item, comment and assignee in it.
          </FlowState>
        )}
        {checked.fileExists ? (
          <FlowState icon="file-search-2" tone={itemCount ? "danger" : undefined} title={`${path.trim()} already exists`}>
            {itemCount ? (
              <>
                Connecting replaces the {itemCount === 1 ? "item" : `${itemCount} items`} in <b>{projectName}</b> with the file's lists and items. {itemCount === 1 ? "That item goes" : "Those items go"} to the Trash; Undo under Recent syncs brings {itemCount === 1 ? "it" : "them"} back.
              </>
            ) : (
              <>
                <b>{projectName}</b> takes the file's lists and items.
              </>
            )}{" "}
            From then on, edits in todoi and in the file sync both ways.
          </FlowState>
        ) : (
          <FlowState icon="file-plus-2" title={`No ${path.trim()} yet`}>
            todoi writes <b>{projectName}</b> to this new file{itemCount ? ` (${itemCount === 1 ? "1 item" : `${itemCount} items`})` : ""} and keeps both in sync from then on.
          </FlowState>
        )}
        <InlineError message={lost} />
      </FlowFrame>
    );

  return (
    <FlowFrame
      open={open}
      onClose={onClose}
      title="Connect a repository"
      width={520}
      initialFocus={viaApp ? undefined : repoRef}
      footerLead={
        github ? (
          <>
            {viaApp ? (
              <>
                GitHub: {github.login} ·{" "}
                {github.onUnlink ? (
                  <>
                    <button type="button" className="td-git-link" onClick={github.onUnlink}>
                      Switch account
                    </button>{" "}
                    ·{" "}
                  </>
                ) : null}
              </>
            ) : null}
            <button type="button" className="td-git-link" onClick={() => switchWay(viaApp)}>
              {viaApp ? "Use a token" : github.login ? "Pick from GitHub instead" : "Continue with GitHub instead"}
            </button>
          </>
        ) : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onClose("cancel")}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || offline} onClick={check}>
            {busy ? "Checking…" : "Check repository"}
          </Button>
        </>
      }
    >
      <form
        className="td-account-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
          e.preventDefault();
          check();
        }}
      >
        {intro}
        {viaApp ? (
          <div className="td-account-field">
            <span className="td-account-label">Repository</span>
            <Select
              aria-label="Repository"
              block
              width="var(--anchor-width)"
              icon="git-branch"
              placeholder={github.loading ? "Loading repositories…" : "Pick a repository"}
              disabled={github.loading}
              value={picked?.fullName ?? null}
              options={github.repos.map((r) => ({ value: r.fullName, hint: !r.canPush ? "Read only" : r.private ? "Private" : "Public", disabled: !r.canPush }))}
              onChange={(v) => {
                setRepoText(v ?? "");
                setBranch(null);
                onEdit?.();
              }}
            />
            <InlineError message={show("repo")} />
            <p className="td-account-note">
              The repositories todoi was given on GitHub{github.more ? " (the first 500 of each account)" : ""}.{" "}
              {github.manageUrl ? (
                <>
                  <a className="td-git-link" href={github.manageUrl} target="_blank" rel="noreferrer">
                    Add another on GitHub
                  </a>
                  ; it shows up here when you come back.
                </>
              ) : null}
            </p>
          </div>
        ) : (
          <div className="td-account-field">
            <label className="td-account-label" htmlFor="td-git-repo">
              Repository
            </label>
            <input ref={repoRef} id="td-git-repo" className="td-field" value={repoText} placeholder="acme/plans" autoComplete="off" spellCheck={false} aria-invalid={show("repo") ? true : undefined} onChange={(e) => changeRepo(e.target.value)} onBlur={() => setTouched(true)} />
            <InlineError message={show("repo")} />
          </div>
        )}
        <div className="td-git-pair">
          <div className="td-account-field">
            <label className="td-account-label" htmlFor="td-git-branch">
              Branch
            </label>
            <input id="td-git-branch" className="td-field" value={branch} autoComplete="off" spellCheck={false} aria-invalid={show("branch") ? true : undefined} onChange={(e) => edit<string | null>(setBranch)(e.target.value)} />
            <InlineError message={show("branch")} />
          </div>
          <div className="td-account-field">
            <label className="td-account-label" htmlFor="td-git-path">
              File
            </label>
            <input id="td-git-path" className="td-field td-git-mono" value={path} autoComplete="off" spellCheck={false} aria-invalid={show("path") ? true : undefined} onChange={(e) => edit(setPath)(e.target.value)} />
            <InlineError message={show("path")} />
          </div>
        </div>
        <div className="td-account-field">
          <span className="td-account-label">Format</span>
          <Segmented aria-label="Format" value={format} options={FORMATS.map((f) => ({ id: f.id, label: f.label }))} onChange={changeFormat} />
          <p className="td-account-note">{format === "embridge" ? "Embridge Markdown: easy to read and edit by hand." : format === "json" ? "Strict JSON with a published schema, for tools and agents." : "YAML: readable like Markdown, strict like JSON."}</p>
        </div>
        {viaApp ? null : (
        <div className="td-account-field">
          <label className="td-account-label" htmlFor="td-git-token">
            GitHub token
          </label>
          <input id="td-git-token" className="td-field td-git-mono" type="password" value={token} placeholder="github_pat_…" autoComplete="off" spellCheck={false} aria-invalid={show("token") ? true : undefined} aria-describedby="td-git-token-note" onChange={(e) => edit(setToken)(e.target.value)} />
          <InlineError message={show("token")} />
          <p className="td-account-note" id="td-git-token-note">
            A fine-grained token with access to this repository only and <b>Contents: Read and write</b>.{" "}
            <a className="td-git-link" href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
              Create one on GitHub
            </a>
            , then pick this repository there. todoi stores the token encrypted and never shows it again.
          </p>
        </div>
        )}
        <div className="td-account-field">
          <span className="td-account-label">When both sides change the same thing</span>
          <Select aria-label="When both sides change the same thing" value={policy} options={POLICIES.map((p) => ({ value: p.value, label: p.label }))} onChange={(v) => setPolicy(v as ConflictPolicy)} width={240} />
        </div>
        <InlineError message={lost} />
      </form>
    </FlowFrame>
  );
}
