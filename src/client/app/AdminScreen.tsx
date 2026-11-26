// The operator console (/admin, work plan R8): Todoi's health for the people who run it — accounts and
// content, grouped errors (server, browser, jobs, Git sync) with their stack and a way to mark them
// resolved, the background job queue with retries, Git sync connections that fail or fell behind, and
// an account search. Built from the settings shell's cards. Operators only (ADMIN_EMAILS).
import { useState } from "react";

import { useAdminAccounts, useAdminMutations, useAdminOverview, type AdminOverview } from "../data/admin";
import { ApiError, errorMessage } from "../data/api";
import { Button } from "../design/core/Button";
import { formatRelative } from "../design/core/dates";
import { EmptyState } from "../design/core/EmptyState";
import { IconButton } from "../design/core/IconButton";
import { count } from "../design/core/text";
import { TextField } from "../design/core/TextField";
import { SettingsCard, SettingsPageFrame, StatusDot, type SettingsRow } from "../design/settings/SettingsShell";
import { useFeedback } from "./feedback";
import "./admin.css";

const SOURCE_NAMES = { server: "Server", client: "Browser", job: "Background job", "git-sync": "Git sync" } as const;
const ago = (iso: string | null) => (iso ? formatRelative(iso) : "never");
const num = (n: number) => n.toLocaleString("en");

export function AdminScreen() {
  const overview = useAdminOverview();
  const [q, setQ] = useState("");
  const accounts = useAdminAccounts(q.trim());
  const [open, setOpen] = useState<string | null>(null);
  const am = useAdminMutations();
  const notify = useFeedback((s) => s.notify);
  const failed = (what: string) => (err: unknown) => notify({ message: `Couldn't ${what}: ${errorMessage(err)}`, icon: "circle-alert" });

  if (overview.isError) {
    const denied = overview.error instanceof ApiError && overview.error.status === 403;
    return (
      <SettingsPageFrame title="Operator console">
        {denied ? (
          <EmptyState icon="lock" title="Only Todoi's operators can open this page" hint="It shows errors and accounts across Todoi. Your own data is under Settings and Account." />
        ) : (
          <EmptyState tone="danger" icon="circle-alert" title="The console couldn't load" hint={errorMessage(overview.error)} action={{ label: "Try again", icon: "refresh-cw", onClick: () => void overview.refetch() }} />
        )}
      </SettingsPageFrame>
    );
  }
  const o: AdminOverview | undefined = overview.data;
  const openErrors = o?.errors.filter((e) => !e.resolvedAt) ?? [];

  const errorRows: SettingsRow[] = (o?.errors ?? []).map((e) => ({
    id: `err-${e.fingerprint}`,
    label: (
      <span className="td-admin-error">
        <span className="td-admin-kind">{e.kind}</span> {e.message}
      </span>
    ),
    hint: [SOURCE_NAMES[e.source], e.where, `${num(e.count)}×`, `last ${ago(e.lastSeen)}`, `first ${ago(e.firstSeen)}`, e.lastRequestId ? `ref ${e.lastRequestId.slice(0, 8)}` : null, e.resolvedAt ? `resolved ${ago(e.resolvedAt)}` : null].filter(Boolean).join(" · "),
    bodyText: e.sample ?? "",
    body: open === e.fingerprint ? <pre className="td-admin-stack">{e.sample ?? "No stack recorded"}</pre> : undefined,
    control: e.resolvedAt ? (
      <StatusDot label="Resolved" />
    ) : (
      <span className="td-admin-actions">
        <IconButton name={open === e.fingerprint ? "chevron-up" : "chevron-down"} label={`${open === e.fingerprint ? "Hide" : "Show"} the stack`} size={28} iconSize={16} aria-expanded={open === e.fingerprint} onClick={() => setOpen((x) => (x === e.fingerprint ? null : e.fingerprint))} />
        <Button onClick={() => am.resolveError.mutate(e.fingerprint, { onError: failed("mark it resolved") })}>Resolve</Button>
      </span>
    ),
  }));

  return (
    <SettingsPageFrame title="Operator console" crumb="Todoi's health: accounts, errors, background work and Git sync. Only operators see this page.">
      <SettingsCard
        group={{
          id: "overview",
          title: "Overview",
          sub: overview.isFetching ? "Refreshing…" : "Refreshes every 30 seconds",
          rows: o
            ? [
                { id: "accounts", label: `${num(o.accounts.registered)} accounts`, hint: `${num(o.accounts.verified)} confirmed · ${num(o.accounts.new7d)} new and ${num(o.accounts.active7d)} active this week · ${num(o.accounts.guests)} guest workspaces` },
                { id: "content", label: `${num(o.content.projects)} projects`, hint: `${num(o.content.items)} items, outside the Trash` },
              ]
            : [{ id: "loading", label: "Loading…" }],
        }}
      />
      <SettingsCard group={{ id: "errors", title: "Errors", sub: o ? (openErrors.length ? count(openErrors.length, "open problem") : "Nothing open") : undefined, tone: openErrors.length ? "warn" : undefined, rows: errorRows, empty: "No errors recorded" }} />
      <SettingsCard
        group={{
          id: "jobs",
          title: "Background jobs",
          tone: o && (o.jobs.overdue || o.jobs.failed) ? "warn" : undefined,
          rows: o
            ? [
                { id: "queue", label: o.jobs.overdue ? `${count(o.jobs.overdue, "job")} waiting too long` : "Queue running", hint: `${num(o.jobs.queued)} queued · ${num(o.jobs.running)} running · ${num(o.jobs.failed)} failed${o.jobs.overdue ? " · waiting more than 5 minutes means no worker is picking jobs up" : ""}`, control: <StatusDot on={!o.jobs.overdue} label={o.jobs.overdue ? "Behind" : "Healthy"} /> },
                ...o.jobs.recentFailures.map((j) => ({ id: `job-${j.id}`, label: `${j.kind} gave up after ${count(j.attempts, "attempt")}`, hint: [j.lastError, j.finishedAt ? ago(j.finishedAt) : null].filter(Boolean).join(" · "), control: <Button icon="refresh-cw" onClick={() => am.retryJob.mutate(j.id, { onSuccess: () => notify({ message: `Queued ${j.kind} again`, icon: "refresh-cw" }), onError: failed("retry it") })}>Retry</Button> })),
              ]
            : [],
        }}
      />
      <SettingsCard
        group={{
          id: "git",
          title: "Git sync",
          tone: o?.gitSync.error ? "warn" : undefined,
          rows: o
            ? [
                { id: "git-summary", label: count(o.gitSync.total, "connection"), hint: `${num(o.gitSync.ok)} in sync · ${num(o.gitSync.conflict)} paused on a conflict · ${num(o.gitSync.error)} failing · ${num(o.gitSync.overdue.length)} overdue` },
                ...o.gitSync.failing.map((f) => ({ id: `gf-${f.projectId}`, label: `${f.project} · ${f.owner}/${f.repo}`, hint: `Failing: ${f.lastError ?? "no reason recorded"} · last synced ${ago(f.lastSyncedAt)}` })),
                ...o.gitSync.overdue.map((f) => ({ id: `go-${f.projectId}`, label: `${f.project} · ${f.owner}/${f.repo}`, hint: `Overdue: last synced ${ago(f.lastSyncedAt)}, though it syncs every 10 minutes` })),
              ]
            : [],
        }}
      />
      <SettingsCard
        group={{
          id: "accounts",
          title: "Accounts",
          sub: q.trim() ? undefined : "Newest first",
          rows: [
            { id: "search", label: "Find an account", hint: "By email address or name", control: <TextField icon="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Find an account" /> },
            ...(accounts.data ?? []).map((a) => ({ id: `acct-${a.id}`, label: a.guest ? "Guest workspace" : `${a.name} · ${a.email}`, hint: [a.guest ? null : a.verified ? "Confirmed" : "Not confirmed yet", count(a.projects, "project"), `joined ${ago(a.createdAt)}`, `last seen ${ago(a.lastSeen)}`].filter(Boolean).join(" · "), control: a.guest || a.verified ? undefined : <Button icon="check" onClick={() => am.confirmEmail.mutate(a.id, { onSuccess: () => notify({ message: `Confirmed ${a.email}`, icon: "check" }), onError: failed("confirm it") })}>Mark confirmed</Button> })),
            ...(accounts.data && !accounts.data.length ? [{ id: "none", label: "No accounts match" }] : []),
          ],
        }}
      />
    </SettingsPageFrame>
  );
}
