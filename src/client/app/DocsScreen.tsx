// Docs — two short secondary pages: /docs (how to use Todoi) and /docs/agents (how an AI agent uses the
// API). Brief on purpose; the full reference comes later. Same canvas and cards as Import
// (SettingsPageFrame + SettingsCard); each card's body is prose. Spec: DESIGN.md › Secondary pages.
// public/docs/agents.md is the plain-Markdown copy of the agents page (served at /docs/agents.md and
// listed in /llms.txt): change both together.
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "../design/core/Button";
import { SettingsCard, SettingsLink, SettingsPageFrame, type SettingsRow } from "../design/settings/SettingsShell";
import "./docs.css";

export type DocsPage = "people" | "agents";

interface DocsCard {
  id: string;
  title: string;
  body: ReactNode;
}

const API = "https://todoi.com/api";

const PAGES: Record<DocsPage, { title: string; crumb: string; cards: DocsCard[] }> = {
  people: {
    title: "How Todoi works",
    crumb: "The basics on one page. Settings › Help has topics and the full shortcut map.",
    cards: [
      {
        id: "model",
        title: "Groups, projects, lists, items",
        body: (
          <p>
            A <strong>project group</strong> holds projects. A <strong>project</strong> holds lists, and a <strong>list</strong> holds items. Every item has a short key such as <code>MP-102</code>. Items you capture without a project land in your <strong>Inbox</strong>.
          </p>
        ),
      },
      {
        id: "views",
        title: "Views",
        body: (
          <p>
            Show a project as a <strong>List</strong> (the default), a <strong>Board</strong> or a <strong>Calendar</strong> with the switcher under the top bar. Filters and sorts can be saved as a view, and the URL keeps the view, so a copied link opens what you see.
          </p>
        ),
      },
      {
        id: "add",
        title: "Add and edit items",
        body: (
          <ul>
            <li>
              Press <kbd>N</kbd> to add an item. Type <code>#label @name !high due fri &gt;Doing</code> in the title to set those properties as you add it.
            </li>
            <li>Click an item, or press <kbd>Enter</kbd>, to open it: description, subitems, comments, attachments and dates.</li>
            <li>
              On the focused item: <kbd>E</kbd> renames, <kbd>D</kbd> marks done, <kbd>1</kbd>–<kbd>4</kbd> sets the priority, <kbd>⌫</kbd> deletes. Drag items, or move them with <kbd>Ctrl</kbd> + arrows.
            </li>
            <li>
              <kbd>Z</kbd> undoes the last change, up to 10 steps back.
            </li>
          </ul>
        ),
      },
      {
        id: "find",
        title: "Find things",
        body: (
          <p>
            <kbd>/</kbd> searches, <kbd>Ctrl</kbd> + <kbd>K</kbd> opens the command palette (it finds items by key too), and <kbd>?</kbd> shows every shortcut.
          </p>
        ),
      },
      {
        id: "share",
        title: "Work together",
        body: (
          <p>
            Invite people from a project's Members menu as an <strong>Admin</strong>, <strong>Editor</strong> or <strong>Viewer</strong>. Assign items with <code>@name</code> and mention people in comments. Their notifications arrive in their Inbox.
          </p>
        ),
      },
      {
        id: "data",
        title: "Your data",
        body: (
          <p>
            Export a project as Markdown, PDF or CSV, or your whole account from Account › Data. Import Markdown, a Trello board or a CSV from Settings › Storage &amp; sync. Todoi keeps working offline and syncs when you're back.
          </p>
        ),
      },
    ],
  },
  agents: {
    title: "Todoi for agents",
    crumb: "How an AI agent or script reads and changes Todoi on someone's behalf.",
    cards: [
      {
        id: "auth",
        title: "Sign in with a token",
        body: (
          <>
            <p>
              The person creates a token in Account › API tokens and gives it to you. Send it with every request. The token acts as that person, with exactly their access, until it expires or they revoke it.
            </p>
            <pre>{`Authorization: Bearer tdi_…
Content-Type: application/json`}</pre>
          </>
        ),
      },
      {
        id: "api",
        title: "The API",
        body: (
          <>
            <p>
              JSON over HTTPS at <code>{API}</code>.
            </p>
            <ul>
              <li>
                <code>GET /groups</code>: groups with their projects
              </li>
              <li>
                <code>GET /projects/:id</code>: a project with its lists and members
              </li>
              <li>
                <code>GET /items?projectId=</code> or <code>?listId=</code>: items (no parameter: the Inbox)
              </li>
              <li>
                <code>GET /search?q=</code>: find items by title or key
              </li>
              <li>
                <code>POST /items</code>: add an item: <code>{`{ "id", "title", "listId"?, "dueDate"?, "priority"? }`}</code>
              </li>
              <li>
                <code>PATCH /items/:id</code>: change fields; <code>{`{ "done": true }`}</code> completes it
              </li>
              <li>
                <code>POST /items/:id/move</code>: <code>{`{ "listId", "position"? }`}</code>
              </li>
              <li>
                <code>POST /items/:id/comments</code>: <code>{`{ "id", "body" }`}</code>
              </li>
              <li>
                <code>GET /me/export</code>: everything the person can see, as one JSON file
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "rules",
        title: "Good manners",
        body: (
          <ul>
            <li>
              You choose new ids: 21 characters from <code>A–Z a–z 0–9 _ -</code>. Dates are <code>YYYY-MM-DD</code>. Priority is <code>URGENT</code>, <code>HIGH</code>, <code>MEDIUM</code> or <code>LOW</code>.
            </li>
            <li>
              To retry a write safely, send the same <code>X-Todoi-Operation-Id</code> header again; Todoi applies it once.
            </li>
            <li>Errors return a status code and a plain sentence in <code>error</code>; show it to the person rather than guessing.</li>
            <li>Read before you write, and delete or archive only when the person asked you to.</li>
          </ul>
        ),
      },
    ],
  },
};

export function DocsScreen({ page }: { page: DocsPage }) {
  const navigate = useNavigate();
  const doc = PAGES[page];
  const other = page === "people" ? { label: "Todoi for agents", hint: "Using Todoi from an AI agent or a script", to: "/docs/agents" as const } : { label: "How Todoi works", hint: "The guide for people", to: "/docs" as const };
  const more: SettingsRow[] = [{ id: "other", label: other.label, hint: other.hint, control: <Button icon="arrow-right" onClick={() => void navigate({ to: other.to })}>Open</Button> }];
  if (page === "agents") more.push({ id: "markdown", label: "This page as Markdown", hint: "/docs/agents.md — plain text for agents, also listed in /llms.txt", control: <SettingsLink href="/docs/agents.md" /> });
  return (
    <SettingsPageFrame title={doc.title} crumb={doc.crumb}>
      {doc.cards.map((c) => (
        <SettingsCard key={c.id} group={{ id: `docs-${c.id}`, title: c.title, rows: [] }}>
          <div className="td-docs">{c.body}</div>
        </SettingsCard>
      ))}
      <SettingsCard group={{ id: "docs-more", title: "More", rows: more }} />
    </SettingsPageFrame>
  );
}
