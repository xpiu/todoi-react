// Settings and Account on the SettingsShell: every row is declared in the registries below, so the
// nav, search and layout follow. Rows that need a backend not built yet say so in their hint.
// Spec: DESIGN.md › Settings, Account.
import { getRouteApi, useNavigate, type UseNavigateResult } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";

import { LABEL_COLORS, type LabelColor } from "../../shared/enums";
import { authClient } from "../auth";
import { useAccountMutations, useMe, useSessions, useTokens } from "../data/account";
import { useLabelMutations } from "../data/itemContent";
import { api, unwrap } from "../data/api";
import { useArchive } from "../data/projects";
import { projectsOf, useGroups, useLabels, useProjectItems } from "../data/queries";
import { Avatar } from "../design/core/Avatar";
import { useAppearance, STATUS_DISPLAY_OPTIONS } from "../design/core/appearance";
import { Button } from "../design/core/Button";
import { Checkbox } from "../design/core/Checkbox";
import { formatDate, formatRelative } from "../design/core/dates";
import { Dialog } from "../design/core/Dialog";
import type { IconName } from "../design/core/Icon";
import { IconButton } from "../design/core/IconButton";
import { nextLabelColor } from "../design/core/LabelPicker";
import { MenuButton, MenuDivider, MenuItem } from "../design/core/Menu";
import { Segmented } from "../design/core/Segmented";
import { Select } from "../design/core/Select";
import { Keys } from "../design/core/ShortcutHint";
import { SHORTCUTS } from "../design/core/shortcuts";
import { SwatchGroup } from "../design/core/SwatchGroup";
import { Switch } from "../design/core/Switch";
import { count } from "../design/core/text";
import { TextField } from "../design/core/TextField";
import { MODES, THEMES } from "../design/core/themes";
import { relativeSync } from "../design/core/ConnectionStatus";
import { useSaveState } from "./saveState";
import { PasswordField } from "../design/auth/PasswordField";
import { MonoValue, SettingsLink, SettingsShell, StatusDot, type SettingsGroup, type SettingsPage, type SettingsRow } from "../design/settings/SettingsShell";
import { quote, useFeedback } from "./feedback";
import { useLifecycle } from "./lifecycle";
import { projectUrl } from "./links";
import { usePrefs, type Prefs } from "./prefs";
import { avatarColorVar, useCurrentUser } from "./session";

const settingsRoute = getRouteApi("/app/settings");
const accountRoute = getRouteApi("/app/account");

type Page = "settings" | "account";
type Notify = ReturnType<typeof useFeedback.getState>["notify"];
type Opt<V extends string = string> = { value: V; label: string };
const opts = <V extends string>(pairs: ReadonlyArray<readonly [V, string]>): Opt<V>[] => pairs.map(([value, label]) => ({ value, label }));

const DATE_FORMATS = opts([["mdy-text", "Jan 10, 2020"], ["dmy-text", "10 Jan 2020"], ["iso", "2020-01-10"], ["mdy", "01/10/2020"], ["dmy", "10/01/2020"]] as const);
const WEEK_STARTS = opts([["mon", "Monday"], ["sun", "Sunday"], ["sat", "Saturday"]] as const);
const PRIORITIES = opts([["none", "None"], ["URGENT", "Urgent"], ["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]] as const);
const TOKEN_EXPIRIES = opts([["30", "30 days"], ["90", "90 days"], ["180", "180 days"], ["365", "1 year"]] as const);
const STATUS_DISPLAYS = STATUS_DISPLAY_OPTIONS.map((o) => ({ value: o.id, label: o.label }));
const LABEL_SWATCHES = LABEL_COLORS.map((c) => ({ value: c, label: c, swatch: `var(--label-${c})` }));
const BROWSER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();
const HELP_TOPICS = [
  { id: "h-add", label: "Add items fast", hint: "Quick-add and its inline syntax", body: "Press N to open quick-add in the list you're in. Type #label @name !high due fri >List and the properties land on the new item; the row under the field previews them. Enter adds the item and keeps the field open for the next one." },
  { id: "h-move", label: "Move items", hint: "Drag, or move with the keyboard", body: "Drag an item within or across lists in Board and List view, or press Ctrl + arrows to move the focused item. Cross-list moves show a toast with Undo." },
  { id: "h-status", label: "Lists and statuses", hint: "How a list can set an item's Status", body: "A list can carry a Status role. With Link lists with statuses on for the project, items created in or moved into that list take its Status. Changing a role never rewrites items silently — you're asked whether to apply it to existing items." },
  { id: "h-views", label: "Saved views", hint: "Keep a filter and sort as a tab", body: "When a filter or sort is active, Save view keeps it as a tab under the toolbar. Shared views show a users glyph; personal ones don't. The URL mirrors the view, so a copied link reproduces it." },
  { id: "h-select", label: "Select several items", hint: "Bulk actions with one undo", body: "Press S to select the focused item, shift + arrows to extend, Ctrl + A for the whole list. The bar at the bottom applies Move, Priority, Label, Assign, Done or Delete to the selection with one undo." },
  { id: "h-keys", label: "Item keys", hint: "Short references like MP-102", body: "Every item has a short key. Hover a key on a card to copy it and paste it into commits or chat. Search and the command palette (Ctrl + K) find items by key." },
  { id: "h-undo", label: "Undo", hint: "Deletions, moves and bulk actions", body: "Anything undoable shows a toast bottom-left. Press Z or Ctrl + Z to undo it — also after the toast is gone, up to 10 steps back in this session. Each undo confirms with its own toast; there is no redo." },
  { id: "h-export", label: "Export and print", hint: "PDF, Markdown or CSV", body: "Share › Export this view writes what you see — filters and sort applied — as PDF, Markdown or CSV. An item's ⋯ menu has Export… for that item with its subitems and comments, and Print. Markdown is the same format Import reads." },
];
const ABOUT_LINKS = [["privacy", "Privacy", "https://todoi.app/privacy"], ["terms", "Terms", "https://todoi.app/terms"], ["licences", "Licences", "https://todoi.app/licences"]] as const;
const SUPPORT_LINKS = [["docs", "Documentation", "Guides for every part of Todoi", "https://todoi.app/docs"], ["status", "Service status", "Uptime and incidents", "https://status.todoi.app"], ["contact", "Contact support", "We answer within a working day", "mailto:support@todoi.app"]] as const;

export function SettingsScreen({ page }: { page: Page }) {
  const search = (page === "settings" ? settingsRoute : accountRoute).useSearch();
  const navigate = useNavigate();
  const { pages, dialogs } = useSettingsPages(page);
  return (
    <>
      <SettingsShell pages={pages} page={page} section={search.s} onNavigate={(p, s) => void navigate({ to: p === "settings" ? "/settings" : "/account", search: { s } })} />
      {dialogs}
    </>
  );
}

/** The export rows appear under Settings › Storage and Account › Data alike. */
const exportRows = (notify: Notify, navigate: UseNavigateResult<string>): SettingsRow[] => [
  { id: "exportJson", label: "Export everything", hint: "One JSON file with your groups, projects, lists, labels and items", control: <Button icon="download" onClick={() => {
    window.open("/api/me/export", "_blank", "noopener");
    notify({ message: "Exported everything as JSON", icon: "download" });
  }}>Export .json</Button> },
  { id: "exportMd", label: "Export a project", hint: "Share › Export this view on the project writes Markdown or CSV of what you see", control: <Button icon="arrow-right" onClick={() => navigate({ to: "/projects" })}>Projects</Button> },
];

/** Both registries: the other page's rows stay searchable, but its data loads only when it is open. */
function useSettingsPages(page: Page): { pages: SettingsPage[]; dialogs: ReactNode } {
  const prefs = usePrefs();
  const ap = useAppearance();
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const save = useSaveState();
  const online = save.online;
  const groups = useGroups();
  const projects = useMemo(() => projectsOf(groups.data), [groups.data]);
  const lifecycle = useLifecycle();
  const [helpQ, setHelpQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [labelProject, setLabelProject] = useState<string | null>(null);
  const labelsSection = useLabelsSection(page === "settings" ? labelProject : null, setLabelProject, page === "settings" ? projects : []);
  const account = useAccountPages(page === "account", projects);
  const prefSwitch = (k: keyof Prefs, label: string) => <Switch aria-label={label} checked={!!prefs[k]} onChange={(v) => prefs.set({ [k]: v })} />;
  const sel = <V extends string>(label: string, value: V, options: ReadonlyArray<Opt<V>>, onChange: (v: V) => void, width = 220) => (
    <Select aria-label={label} value={value} options={options} onChange={(v) => v && onChange(v)} placement="bottom-end" tier="detached" width={width} />
  );
  const topics = helpQ.trim() ? HELP_TOPICS.filter((t) => `${t.label} ${t.hint} ${t.body}`.toLowerCase().includes(helpQ.trim().toLowerCase())) : HELP_TOPICS;
  const settings: SettingsPage = {
    id: "settings",
    title: "Settings",
    sections: [
      {
        id: "general",
        label: "General",
        icon: "settings-2",
        groups: [
          {
            id: "date",
            title: "Language and time",
            rows: [
              { id: "language", label: "Language", hint: "Todoi is in English for now; other languages come later", control: <MonoValue value="English" /> },
              { id: "timeZone", label: "Time zone", hint: "Due times and “today” follow this device's zone; picking another zone comes later", control: <MonoValue value={BROWSER_TZ.replace(/_/g, " ")} /> },
              { id: "timeFormat", label: "Time format", hint: "14:00 or 2:00 pm on items and in the calendar", control: <Segmented aria-label="Time format" value={prefs.timeFormat} options={[{ id: "24h", label: "24-hour" }, { id: "12h", label: "12-hour" }]} onChange={(v) => prefs.set({ timeFormat: v })} /> },
              { id: "weekStart", label: "Week starts on", hint: "First column in Week and Month views", control: sel("Week starts on", prefs.weekStart, WEEK_STARTS, (v) => prefs.set({ weekStart: v })) },
              { id: "dateFormat", label: "Date format", hint: "How dates appear on items and in the calendar", control: sel("Date format", prefs.dateFormat, DATE_FORMATS, (v) => prefs.set({ dateFormat: v })) },
              { id: "showCompleted", label: "Show completed items", hint: "Keep done items visible instead of hiding them", control: prefSwitch("showCompleted", "Show completed items") },
              { id: "smartDates", label: "Smart date recognition", hint: "Read “due fri” or “tomorrow” as a date while you type", control: prefSwitch("smartDates", "Smart date recognition") },
            ],
          },
          {
            id: "capture",
            title: "Capture defaults",
            rows: [
              { id: "defaultPriority", label: "Default priority", hint: "New items start with this unless quick-add sets one", control: sel("Default priority", prefs.defaultPriority, PRIORITIES, (v) => prefs.set({ defaultPriority: v })) },
              { id: "defaultDestination", label: "Default destination", hint: "Where an item lands when you don't pick a list: your Inbox", control: <MonoValue value="Inbox" /> },
            ],
          },
        ],
      },
      {
        id: "storage",
        label: "Storage & sync",
        title: "Storage & sync",
        icon: "refresh-cw",
        groups: [
          {
            id: "impexp",
            title: "Import & export",
            rows: [
              ...exportRows(notify, navigate),
              { id: "importFile", label: "Import", hint: "Markdown (the Embridge format), a Trello board's JSON or a CSV — every change is reviewed before it lands", control: <Button icon="upload" onClick={() => navigate({ to: "/import" })}>Import…</Button> },
            ],
          },
          {
            id: "offline",
            title: "Offline editing",
            rows: [
              { id: "online", label: "Connection", hint: "Edits made offline wait in this tab and save when you're back online. They don't survive reloading or closing the tab; Todoi asks before you leave with edits waiting", control: <StatusDot on={online} label={online ? "Online" : "Offline"} /> },
              { id: "pending", label: "Waiting changes", hint: save.waiting ? `${save.waiting === 1 ? "1 edit is" : `${save.waiting} edits are`} waiting to save. Discard puts back what the server has` : save.failed ? `${save.failed === 1 ? "1 edit" : `${save.failed} edits`} didn't save — each was undone and a message said why` : `Nothing waiting to save · ${relativeSync(save.lastSaved)}`, control: save.waiting ? <Button icon="trash-2" onClick={save.discardWaiting}>Discard</Button> : save.failed ? <Button icon="check" onClick={save.clearFailed}>Dismiss</Button> : <Button icon="trash-2" disabled>Discard</Button> },
              { id: "install", label: "Install app", hint: "Opens Todoi in its own window and keeps working offline — available once the app ships as a PWA", control: <Button icon="monitor-down" disabled>Install</Button> },
            ],
          },
        ],
      },
      { id: "labels", label: "Labels", icon: "tag", groups: labelsSection },
      {
        id: "appearance",
        label: "Appearance",
        icon: "palette",
        hint: "Saved on this device — nothing here changes what your team sees.",
        groups: [
          {
            id: "theme",
            title: "Theme and mode",
            rows: [
              { id: "apTheme", label: "Theme", hint: "Standard is the full look; Minimal is the ledger — type, hairlines and ink", control: <Segmented aria-label="Theme" value={ap.theme} options={THEMES.map((t) => ({ id: t.id, label: t.label }))} onChange={(t) => ap.set({ theme: t })} /> },
              { id: "apMode", label: "Mode", hint: "Dark or light inside the theme", control: <Segmented aria-label="Mode" value={ap.mode} options={MODES.map((m) => ({ id: m.id, icon: m.icon, label: m.label }))} onChange={(m) => ap.set({ mode: m })} /> },
              { id: "apBackground", label: "Background", hint: "The canvas behind lists and cards", control: <SwatchGroup aria-label="Background color" options={ap.backgrounds} value={ap.background} onChange={(c) => ap.set({ background: c })} /> },
              ...(ap.foregrounds.length ? [{ id: "apForeground", label: "Foreground", hint: "List and card surfaces", control: <SwatchGroup aria-label="Foreground color" options={ap.foregrounds.map((o) => ({ value: o.id, label: o.label, title: o.title, swatch: `linear-gradient(90deg, ${o.list} 50%, ${o.card} 50%)`, ink: o.ink }))} value={ap.foreground} onChange={(id) => ap.set({ foreground: id })} /> }] : []),
            ],
          },
          {
            id: "display",
            title: "What cards show",
            rows: [
              { id: "apIds", label: "Show item IDs", hint: "The mono key on cards and rows", control: <Switch aria-label="Show item IDs" checked={ap.showItemIds} onChange={(v) => ap.set({ showItemIds: v })} /> },
              { id: "apLabels", label: "Show labels", hint: "Label chips on cards and rows", control: <Switch aria-label="Show labels" checked={ap.showLabels} onChange={(v) => ap.set({ showLabels: v })} /> },
              { id: "apStatus", label: "Status on cards", hint: "When the Status chip appears on a card", control: sel("Status on cards", ap.statusDisplay, STATUS_DISPLAYS, (v) => ap.set({ statusDisplay: v })) },
              { id: "apColorize", label: "Colorize Board columns", hint: "Tint columns and cards by their list's Status role", control: <Switch aria-label="Colorize Board columns" checked={ap.colorizeColumns} onChange={(v) => ap.set({ colorizeColumns: v })} /> },
            ],
          },
          {
            id: "chrome",
            title: "Chrome",
            rows: [
              { id: "apSidebar", label: "Sidebar on left side", hint: "The rail docks right by default", control: <Switch aria-label="Sidebar on left side" checked={ap.sidebarLeft} onChange={(v) => ap.set({ sidebarLeft: v })} /> },
              { id: "apHints", label: "Suggest shortcuts", hint: "A quiet nudge after pointer actions a key could have done", control: <Switch aria-label="Suggest shortcuts" checked={ap.suggestShortcuts} onChange={(v) => ap.set({ suggestShortcuts: v })} /> },
              { id: "apReset", label: "Reset appearance", hint: "Standard theme, dark mode, the default background, sidebar on the right, everything shown", control: <Button icon="rotate-ccw" onClick={() => ap.reset()}>Reset</Button> },
            ],
          },
        ],
      },
      {
        id: "keyboard",
        label: "Keyboard",
        icon: "keyboard",
        hint: (SHORTCUTS.isMac ? "Shown for macOS — ⌘ is Ctrl on Windows and Linux. " : "Shown for Windows and Linux — Ctrl is ⌘ on macOS. ") + "Shortcuts pause while you’re typing in a field.",
        groups: SHORTCUTS.sections.map((sec, i) => ({ id: `sc${i}`, title: sec.title, rows: sec.rows.map((r, j) => ({ id: `sc${i}-${j}`, label: r[1], keywords: r[0], control: <Keys keys={r[0]} /> })) })),
      },
      {
        id: "help",
        label: "Help",
        icon: "circle-help",
        groups: [
          {
            id: "help-start",
            title: "Getting started",
            rows: [
              { id: "sample", label: "Sample project", hint: "A small project to click around in; delete it whenever you like", control: <Button icon="kanban" onClick={() => lifecycle.openNewProject()}>Create a project</Button> },
              { id: "shortcuts", label: "Keyboard shortcuts", hint: "The full map, also behind ? anywhere in the app", control: <Button icon="keyboard" onClick={() => navigate({ to: "/settings", search: { s: "keyboard" } })}>Open</Button> },
            ],
          },
          {
            id: "help-search",
            title: "Search",
            rows: [{ id: "helpSearch", label: "Search help", hint: helpQ.trim() ? `${count(topics.length, "topic")} match` : "Type to filter the topics below", control: <TextField icon="search" value={helpQ} onChange={(e) => setHelpQ(e.target.value)} placeholder="Search" aria-label="Search help" /> }],
          },
          { id: "help-topics", title: "Topics", empty: `No topics match “${helpQ}”`, rows: topics.map((t) => ({ id: t.id, label: t.label, hint: t.hint, bodyText: t.body, body: expanded === t.id ? t.body : undefined, control: <IconButton name="chevron-down" label={`${expanded === t.id ? "Collapse" : "Expand"} ${t.label}`} size={28} iconSize={16} aria-expanded={expanded === t.id} onClick={() => setExpanded((e) => (e === t.id ? null : t.id))} /> })) },
          { id: "legal", title: "About", rows: ABOUT_LINKS.map(([id, label, href]) => ({ id, label, hint: id === "licences" ? "Open-source software used in Todoi" : undefined, control: <SettingsLink href={href} /> })) },
        ],
      },
      {
        id: "connections",
        label: "Integrations",
        title: "Integrations & connections",
        icon: "git-branch",
        groups: [
          { id: "gh", title: "GitHub sync", tone: "info", rows: [{ id: "ghNone", label: "Not connected", hint: "Keeping a project in a Markdown file in a GitHub repository is a later milestone; Export and Import already speak that format", control: <Button icon="arrow-right" onClick={() => navigate({ to: "/settings", search: { s: "storage" } })}>Import & export</Button> }] },
          { id: "api", title: "API", rows: [{ id: "apiTokens", label: "API tokens", hint: "Scripts and tools act as you with a personal token", control: <Button icon="code" onClick={() => navigate({ to: "/account", search: { s: "tokens" } })}>Manage tokens</Button> }] },
        ],
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: "bell",
        groups: [
          { id: "nt-where", title: "Where they land", rows: [{ id: "ntInbox", label: "Inbox", hint: "Mentions, assignments and comments on items you watch arrive as unread items in your Inbox", control: <Button icon="inbox" onClick={() => navigate({ to: "/inbox" })}>Open Inbox</Button> }] },
          {
            id: "nt-events",
            title: "Events",
            rows: [
              { id: "notifyMentions", label: "Mentions", hint: "When someone @mentions you in a comment", control: prefSwitch("notifyMentions", "Mentions") },
              { id: "notifyAssignments", label: "Assignments", hint: "When an item is assigned to you", control: prefSwitch("notifyAssignments", "Assignments") },
              { id: "notifyWatched", label: "Watched items", hint: "New comments on items you watch (Watch is in the item’s side panel)", control: prefSwitch("notifyWatched", "Watched items") },
              { id: "notifyNews", label: "Todoi news", hint: "Todoi doesn't send release news yet", control: <MonoValue value="Not sent yet" /> },
            ],
          },
          { id: "nt-channels", title: "Channels", rows: [{ id: "notifyEmail", label: "Email delivery", hint: "Email sending isn't set up yet — notifications arrive in your Inbox only", control: <MonoValue value="Inbox only" /> }] },
          { id: "nt-display", title: "Display", rows: [{ id: "inboxBadge", label: "Unread count on Inbox", hint: "Show a dot on the sidebar Inbox row while it holds unread items", control: prefSwitch("inboxBadge", "Unread count on Inbox") }] },
        ],
      },
    ],
  };
  return { pages: [settings, account.page], dialogs: account.dialogs };
}

type ProjectOption = { id: string; name: string; icon: string | null; color: string | null };
type LabelDraft = { id: string | null; name: string; color: LabelColor };

/** Settings › Labels: a project picker, then one row per label with rename / recolour / merge / delete. */
function useLabelsSection(projectId: string | null, setProject: (id: string) => void, projects: ProjectOption[]): SettingsGroup[] {
  const cur = projects.find((p) => p.id === projectId) ?? projects[0];
  const labels = useLabels(cur?.id ?? "");
  const items = useProjectItems(cur?.id ?? "");
  const ops = useLabelMutations(cur?.id ?? "");
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const [edit, setEdit] = useState<LabelDraft | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  // Items per label, one pass over the project's items.
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items.data ?? []) for (const id of it.labelIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [items.data]);
  if (!projects.length) return [{ id: "lb-noproject", title: "Labels", tone: "info", rows: [{ id: "lbNoProject", label: "No projects yet", hint: "Labels belong to a project", control: <Button icon="kanban" onClick={() => navigate({ to: "/projects" })}>Projects</Button> }] }];
  const ls = labels.data ?? [];
  const labelled = ls.reduce((n, l) => n + (usage.get(l.id) ?? 0), 0);
  const editRows = (e: LabelDraft): SettingsRow[] => [
    { id: `lb-edit-name`, label: "Name", control: <TextField value={e.name} aria-label="Label name" autoFocus onChange={(ev) => setEdit({ ...e, name: ev.target.value })} /> },
    { id: `lb-edit-color`, label: "Label color", control: <SwatchGroup size={22} aria-label="Label color" options={LABEL_SWATCHES} value={e.color} onChange={(c) => setEdit({ ...e, color: c as LabelColor })} /> },
    {
      id: `lb-edit-save`,
      label: e.id ? "Save changes" : "Create label",
      control: (
        <>
          <Button variant="ghost" onClick={() => setEdit(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!e.name.trim()}
            onClick={() => {
              if (e.id) ops.update.mutate({ id: e.id, name: e.name.trim(), color: e.color });
              else ops.create.mutate({ name: e.name.trim(), color: e.color });
              setEdit(null);
            }}
          >
            {e.id ? "Save" : "Create"}
          </Button>
        </>
      ),
    },
  ];
  const rows: SettingsRow[] = [];
  for (const l of ls) {
    const n = usage.get(l.id) ?? 0;
    const others = ls.filter((x) => x.id !== l.id);
    rows.push({
      id: `lb-${l.id}`,
      label: l.name,
      hint: count(n, "item"),
      swatch: `var(--label-${l.color})`,
      control:
        merging === l.id ? (
          <>
            <Select aria-label={`Merge ${l.name} into`} placeholder="Merge into…" value={null} options={others.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => {
              setMerging(null);
              if (!v) return;
              const into = others.find((o) => o.id === v);
              void api.api.labels[":id"].merge.$post({ param: { id: l.id }, json: { intoLabelId: v } }).then((r) => unwrap<{ moved: number }>(r)).then((res) => {
                notify({ message: `Merged the label ${l.name} into ${into?.name ?? "the other label"} — ${count(res.moved, "item")} relabelled`, icon: "merge" });
                labels.refetch();
                items.refetch();
              });
            }} width={220} tier="detached" />
            <Button variant="ghost" onClick={() => setMerging(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <MenuButton label={`Options for ${l.name}`} tooltip="Options" placement="bottom-end" tier="detached" size={28} iconSize={16}>
            <MenuItem icon="pencil" onSelect={() => setEdit({ id: l.id, name: l.name, color: l.color as LabelColor })}>
              Name and color
            </MenuItem>
            <MenuItem icon="merge" disabled={!others.length} onSelect={() => setMerging(l.id)}>
              Merge into…
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon="trash-2"
              danger
              onSelect={() => {
                ops.remove.mutate({ id: l.id });
                notify({ message: `Deleted the label ${l.name} — removed from ${count(n, "item")}`, icon: "trash-2" });
              }}
            >
              Delete
            </MenuItem>
          </MenuButton>
        ),
    });
    if (edit?.id === l.id) rows.push(...editRows(edit));
  }
  if (edit && !edit.id) rows.push(...editRows(edit));
  return [
    {
      id: "lb-project",
      title: "Project",
      rows: [
        { id: "lbProject", label: "Project", hint: "Labels are per project", control: <Select aria-label="Project" value={cur?.id ?? null} options={projects.map((p) => ({ value: p.id, label: p.name, icon: (p.icon as IconName | null) ?? "kanban", iconColor: p.color ? `var(--label-${p.color})` : undefined }))} onChange={(v) => v && setProject(v)} placement="bottom-end" tier="detached" width={240} /> },
        { id: "lbOpen", label: "Open project", hint: `Leave settings and go to “${cur?.name ?? ""}”`, control: <Button icon="arrow-right" onClick={() => cur && navigate({ to: "/p/$projectId", params: { projectId: cur.id }, search: {} })}>Open</Button> },
      ],
    },
    {
      id: "labels",
      title: "Labels",
      sub: ls.length ? `${count(ls.length, "label")} · ${count(labelled, "labelled item")}` : undefined,
      empty: `No labels in “${cur?.name ?? "this project"}” yet — add one below or with #name in quick-add.`,
      rows: [...rows, ...(edit && !edit.id ? [] : [{ id: "lb-new", label: "New label", hint: "Pick a name and one of the eight colours", control: <Button icon="plus" onClick={() => setEdit({ id: null, name: "", color: nextLabelColor(ls) })}>New label</Button> }])],
    },
  ];
}

/** Account: profile, sign-in, tokens, security, devices, projects, data, support. */
function useAccountPages(active: boolean, projects: Array<ProjectOption & { groupName: string; visibility: string }>): { page: SettingsPage; dialogs: ReactNode } {
  const { user } = useCurrentUser();
  const me = useMe(active);
  const am = useAccountMutations();
  const tokens = useTokens(active);
  const archive = useArchive(undefined, active);
  const sessions = useSessions(active);
  const notify = useFeedback((s) => s.notify);
  const navigate = useNavigate();
  const lifecycle = useLifecycle();
  const session = authClient.useSession();
  const [draft, setDraft] = useState<{ name: string; nickname: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenDays, setTokenDays] = useState("90");
  const [secret, setSecret] = useState<{ name: string; value: string; copied: boolean } | null>(null);
  const [now] = useState(() => new Date());
  const m = me.data;
  const name = draft?.name ?? m?.name ?? user?.name ?? "";
  const nickname = draft?.nickname ?? m?.nickname ?? "";
  const dirty = !!draft && (draft.name !== (m?.name ?? "") || draft.nickname !== (m?.nickname ?? ""));
  const saveProfile = () => {
    if (!dirty) return;
    am.updateMe.mutate({ name: name.trim(), nickname: nickname.trim() || null }, { onSuccess: () => notify({ message: "Profile saved", icon: "check" }) });
    setDraft(null);
  };
  const currentToken = (session.data as { session?: { token?: string } } | null)?.session?.token;
  const sessionRows = (sessions.data ?? []).map((s) => ({ ...s, current: s.token === currentToken }));
  const otherSessions = sessionRows.filter((s) => !s.current).length;
  const archived = (archive.data?.items.length ?? 0) + (archive.data?.projects.length ?? 0);
  const ago = (d: Date | string | null | undefined) => (d ? formatRelative(d, now) : "never");
  const page: SettingsPage = {
    id: "account",
    title: "Account",
    sections: [
      {
        id: "profile",
        label: "Profile",
        icon: "user",
        groups: [
          {
            id: "identity",
            title: "Profile",
            lead: (
              <div className="td-set-id">
                <Avatar name={name || "?"} color={avatarColorVar(m?.avatarColor)} size={40} />
                <div className="td-set-idtext">
                  <div className="td-set-idname">{name}</div>
                  <div className="td-set-idmail">{m?.email ?? user?.email}</div>
                </div>
              </div>
            ),
            rows: [
              { id: "name", label: "Display name", hint: "Shown on comments, avatars and activity", control: <TextField value={name} aria-label="Display name" onChange={(e) => setDraft({ name: e.target.value, nickname })} onKeyDown={(e) => e.key === "Enter" && saveProfile()} /> },
              { id: "nickname", label: "Handle", hint: `@${nickname || (name.split(/\s+/)[0] ?? "").toLowerCase()} · used for @mentions and quick-add`, control: <TextField value={nickname} aria-label="Handle" placeholder="handle" onChange={(e) => setDraft({ name, nickname: e.target.value.replace(/[^a-z0-9._-]/gi, "").toLowerCase() })} onKeyDown={(e) => e.key === "Enter" && saveProfile()} /> },
              { id: "avatarColor", label: "Avatar color", hint: "Behind your initials until you upload an image", control: <SwatchGroup size={22} aria-label="Avatar color" options={LABEL_SWATCHES} value={m?.avatarColor} onChange={(c) => am.updateMe.mutate({ avatarColor: c as LabelColor })} /> },
              {
                id: "save",
                label: "Save profile",
                hint: dirty ? "Unsaved changes" : "Everything is saved",
                control: (
                  <>
                    <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(null)}>
                      Reset
                    </Button>
                    <Button variant="primary" disabled={!dirty} onClick={saveProfile}>
                      Save
                    </Button>
                  </>
                ),
              },
            ],
          },
        ],
      },
      {
        id: "signin",
        label: "Sign-in methods",
        title: "Sign-in and security › Sign-in methods",
        icon: "key-round",
        groups: [
          {
            id: "primary",
            title: "Primary email",
            rows: [{ id: "primaryEmail", label: "Primary email", hint: m?.emailVerified ? "Verified" : "Not verified — verification emails arrive once email sending is set up", control: <MonoValue value={m?.email ?? user?.email ?? ""} /> }],
          },
          {
            id: "methods",
            title: "Connected methods",
            rows: [
              { id: "m-password", label: "Email and password", hint: "Change it any time; other devices can be logged out at the same time", control: <Button icon="key-round" onClick={() => setPwOpen(true)}>Change password</Button> },
              { id: "m-github", label: "GitHub", hint: "Social sign-in arrives with the hosted release", control: <StatusDot label="Not available" /> },
              { id: "m-google", label: "Google", hint: "Social sign-in arrives with the hosted release", control: <StatusDot label="Not available" /> },
            ],
          },
        ],
      },
      {
        id: "tokens",
        label: "API tokens",
        title: "Sign-in and security › API tokens",
        icon: "code",
        groups: [
          {
            id: "newtoken",
            title: "New token",
            fields: true,
            rows: [
              { id: "tokenName", label: "Token name", hint: "Where the token will be used, e.g. CI deploy", control: <TextField value={tokenName} aria-label="Token name" placeholder="CI deploy" onChange={(e) => setTokenName(e.target.value)} /> },
              { id: "tokenExpiry", label: "Expires", control: <Select aria-label="Expires" value={tokenDays} options={TOKEN_EXPIRIES} onChange={(v) => v && setTokenDays(v)} placement="bottom-end" tier="detached" width={160} /> },
              { id: "tokenCreate", label: "Create token", hint: "The token is shown once, right after you create it", control: <Button variant="primary" icon="plus" disabled={!tokenName.trim()} onClick={() => am.createToken.mutate({ name: tokenName.trim(), days: Number(tokenDays) }, { onSuccess: (t) => {
                setSecret({ name: t.name, value: t.secret, copied: false });
                setTokenName("");
              } })}>Create token</Button> },
            ],
          },
          ...(secret ? [{ id: "secret", title: "Copy your new token now", tone: "info" as const, rows: [{ id: "secretValue", label: secret.value, mono: true, hint: secret.copied ? "Copied. It won't be shown again." : "Copy it once — it won't be shown again", control: (
            <>
              <Button icon={secret.copied ? "check" : "copy"} onClick={() => {
                void navigator.clipboard?.writeText(secret.value);
                setSecret({ ...secret, copied: true });
              }}>{secret.copied ? "Copied" : "Copy"}</Button>
              <IconButton name="x" label="Dismiss" size={28} iconSize={16} onClick={() => setSecret(null)} />
            </>
          ) }] }] : []),
          {
            id: "tokenlist",
            title: "Tokens",
            empty: "No tokens yet.",
            rows: (tokens.data ?? []).map((t) => {
              const expired = new Date(t.expiresAt) < now;
              const status = t.revokedAt ? "Revoked" : expired ? "Expired" : "Active";
              return { id: `tk-${t.id}`, label: t.name, hint: `${t.prefix}… · ${expired ? `Expired ${ago(t.expiresAt)}` : `Expires ${formatDate(t.expiresAt)}`} · ${t.lastUsedAt ? `Last used ${ago(t.lastUsedAt)}` : "Never used"}`, control: status === "Active" ? <Button icon="ban" onClick={() => am.revokeToken.mutate({ id: t.id }, { onSuccess: () => notify({ message: `Revoked the token ${quote(t.name)}`, icon: "ban" }) })}>Revoke</Button> : <StatusDot label={status} /> };
            }),
          },
        ],
      },
      {
        id: "security",
        label: "Security",
        title: "Sign-in and security › Security",
        icon: "lock",
        groups: [
          {
            id: "checklist",
            title: "Security checklist",
            rows: [
              { id: "ckEmail", label: "Verified primary email", hint: m?.emailVerified ? "Recovery links reach you" : "Email verification arrives once email sending is set up", control: <StatusDot on={!!m?.emailVerified} label={m?.emailVerified ? "Ready" : "Pending"} /> },
              { id: "ckSessions", label: "Active sessions", hint: otherSessions ? `${count(otherSessions, "other device")} signed in` : "Only this device is signed in", control: <Button icon="monitor-smartphone" onClick={() => navigate({ to: "/account", search: { s: "devices" } })}>Review sessions</Button> },
              { id: "ckEverywhere", label: "Log out everywhere else", hint: "Ends every other session; this device stays signed in", control: <Button icon="log-out" disabled={!otherSessions} onClick={() => void authClient.revokeOtherSessions().then(() => {
                sessions.refetch();
                notify({ message: "Logged out everywhere else", icon: "log-out" });
              })}>Log out others</Button> },
            ],
          },
        ],
      },
      {
        id: "devices",
        label: "Devices",
        title: "Sign-in and security › Devices",
        icon: "monitor-smartphone",
        groups: [
          {
            id: "sessions",
            title: "Signed-in devices",
            empty: "Loading sessions…",
            rows: sessionRows.map((s) => ({ id: `s-${s.id}`, label: describeAgent(s.userAgent) + (s.current ? " · this device" : ""), hint: `${s.ipAddress ?? "unknown address"} · last seen ${ago(s.updatedAt)} · expires ${formatDate(s.expiresAt, { year: "never" })}`, control: s.current ? <StatusDot on label="Current" /> : <Button icon="log-out" onClick={() => void authClient.revokeSession({ token: s.token }).then(() => {
              sessions.refetch();
              notify({ message: `Logged out ${describeAgent(s.userAgent)}`, icon: "log-out" });
            })}>Log out</Button> })),
          },
        ],
      },
      {
        id: "projects",
        label: "Projects",
        title: "Projects and storage",
        icon: "kanban",
        groups: [
          ...projects.map((p) => ({
            id: `pj-${p.id}`,
            title: p.name,
            sub: p.groupName,
            rows: [
              { id: `pj-${p.id}-members`, label: "Members and invites", hint: "Roles, invites and the project link live in Project settings", control: <Button icon="users" onClick={() => lifecycle.openSettings(p.id, "members")}>Open</Button> },
              { id: `pj-${p.id}-link`, label: "Share link", hint: p.visibility === "public" ? "Anyone with the link can read this project" : p.visibility === "shared" ? "Members and guests can open the link" : "Only members can open the link", control: <Button icon="link" onClick={() => {
                void navigator.clipboard?.writeText(projectUrl(p.id));
                notify({ message: `Copied the link to ${quote(p.name)}`, icon: "link" });
              }}>Copy link</Button> },
              { id: `pj-${p.id}-storage`, label: "Storage", hint: "Where this project's data lives", control: <MonoValue value="Todoi database" /> },
            ],
          })),
          { id: "pj-new", title: "New", rows: [{ id: "pjNew", label: "New project", hint: "Pick a group, a template and who can see it", control: <Button icon="plus" onClick={() => lifecycle.openNewProject()}>New project</Button> }] },
        ],
      },
      {
        id: "data",
        label: "Data",
        icon: "database",
        groups: [
          {
            id: "export",
            title: "Your data",
            rows: [
              ...exportRows(notify, navigate),
              { id: "archive", label: "Archive and trash", hint: `${count(archived, "entry", "entries")} waiting to be restored or removed for good`, control: <Button icon="archive" onClick={() => navigate({ to: "/archive", search: {} })}>Open</Button> },
            ],
          },
          { id: "danger", title: "Delete account", tone: "danger", rows: [{ id: "deleteAccount", label: "Delete my account", hint: "Removes your profile and every project you own — contact support to run this until self-service deletion ships", control: <Button icon="trash-2" className="td-set-danger" disabled>Delete</Button> }] },
        ],
      },
      { id: "support", label: "Support", icon: "life-buoy", groups: [{ id: "support", title: "Support", rows: SUPPORT_LINKS.map(([id, label, hint, href]) => ({ id: `sup-${id}`, label, hint, control: <SettingsLink href={href} /> })) }] },
    ],
  };
  const dialogs = <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} onDone={() => notify({ message: "Password updated", icon: "check" })} />;
  return { page, dialogs };
}

function describeAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function ChangePasswordDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [others, setOthers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const can = cur.length > 0 && next.length >= 10 && !busy;
  const save = async () => {
    if (!can) return;
    setBusy(true);
    setError(null);
    const r = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: others });
    setBusy(false);
    if (r.error) setError(r.error.message ?? "Couldn't change the password.");
    else {
      setCur("");
      setNext("");
      onDone();
      onClose();
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Change password" width={420} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!can} onClick={() => void save()}>{busy ? "Saving…" : "Save password"}</Button></>}>
      <PasswordField label="Current password" value={cur} onChange={setCur} autoComplete="current-password" autoFocus />
      <PasswordField label="New password" value={next} onChange={setNext} minLength={10} error={error} />
      <Checkbox checked={others} onChange={setOthers} label="Log out other devices" />
    </Dialog>
  );
}
