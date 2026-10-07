import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";

import { Avatar } from "../core/Avatar";
import { Button } from "../core/Button";
import { Segmented } from "../core/Segmented";
import { Switch } from "../core/Switch";
import { MonoValue, SettingsCard, SettingsLink, SettingsPageFrame, SettingsShell, StatusDot, type SettingsPage, type SettingsShellProps } from "./SettingsShell";

// Row controls own their state here; in the app they read and write the preferences store.
function PrefSwitch({ label, initial = false }: { label: string; initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return <Switch aria-label={label} checked={on} onChange={setOn} />;
}
function TimeFormat() {
  const [value, setValue] = useState<"24h" | "12h">("24h");
  return <Segmented aria-label="Time format" value={value} onChange={setValue} options={[{ id: "24h", label: "24-hour" }, { id: "12h", label: "12-hour" }]} />;
}

const PAGES: SettingsPage[] = [
  {
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
              { id: "timeFormat", label: "Time format", hint: "14:00 or 2:00 pm on items and in the calendar", control: <TimeFormat /> },
              { id: "showCompleted", label: "Show completed items", hint: "Keep done items visible instead of hiding them", control: <PrefSwitch label="Show completed items" initial /> },
              { id: "smartDates", label: "Smart date recognition", hint: "Read “due fri” or “tomorrow” as a date while you type", control: <PrefSwitch label="Smart date recognition" /> },
            ],
          },
        ],
      },
      {
        id: "storage",
        label: "Storage & sync",
        icon: "refresh-cw",
        hint: "Where your work lives",
        groups: [
          {
            id: "offline",
            title: "Offline editing",
            rows: [
              { id: "online", label: "Connection", hint: "Workspace edits are saved on this device before syncing", control: <StatusDot on label="Online" /> },
              { id: "install", label: "Install app", hint: "Available once the app ships as a PWA", control: <Button icon="monitor-down" disabled>Install</Button> },
            ],
          },
          { id: "conflicts", title: "Needs review", tone: "warn", rows: [], empty: "Nothing waiting for review." },
        ],
      },
      {
        id: "labels",
        label: "Labels",
        icon: "tag",
        groups: [
          {
            id: "labels",
            title: "Labels",
            sub: "Helicopter sales",
            rows: [
              { id: "l1", label: "Sales", swatch: "var(--label-blue)", control: <Button variant="ghost">Edit</Button> },
              { id: "l2", label: "Urgent", swatch: "var(--label-red)", control: <Button variant="ghost">Edit</Button> },
            ],
          },
        ],
      },
    ],
  },
  {
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
              <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 16 }}>
                <Avatar name="Flo Zuallaert" color="var(--label-teal)" size={40} decorative />
                <b>Flo Zuallaert</b>
              </div>
            ),
            rows: [{ id: "email", label: "Email", hint: "Used to sign in", control: <MonoValue value="flo@todoi.com" /> }],
          },
          {
            id: "tokens",
            title: "API tokens",
            rows: [{ id: "token", label: "tdi_live_•••• 4f2a", mono: true, hint: "Created 12 Sep", keywords: ["secret"], control: <SettingsLink href="https://todoi.app/docs/api" label="Docs" /> }],
          },
        ],
      },
    ],
  },
];

// Story state models the router: the page and section come from the URL in the app.
function RoutedShell(args: SettingsShellProps) {
  const [loc, setLoc] = useState({ page: args.page, section: args.section });
  return (
    <SettingsShell
      {...args}
      page={loc.page}
      section={loc.section}
      onNavigate={(page, section) => {
        setLoc({ page, section });
        args.onNavigate(page, section);
      }}
    />
  );
}

const meta = {
  title: "Settings/SettingsShell",
  component: SettingsShell,
  render: (args) => <RoutedShell {...args} />,
  decorators: [(Story) => <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}><Story /></div>],
  args: { pages: PAGES, page: "settings", section: "general", onNavigate: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The shell for /settings and /account: a page nav on the chrome and one card per group of rows (a label, optional hint and exactly one control). The caller declares every page as data and owns navigation through onNavigate; the shell keeps only the search query, which filters rows on every page into breadcrumbed cards. SettingsPageFrame and SettingsCard give a page without the nav the same canvas and cards." } },
  },
} satisfies Meta<typeof SettingsShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const General: Story = {
  async play({ canvas, userEvent }) {
    const smart = canvas.getByRole("switch", { name: "Smart date recognition" });
    await userEvent.click(smart);
    await expect(smart).toHaveAttribute("aria-checked", "true");
  },
};
export const Navigate: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Storage & sync" }));
    await expect(args.onNavigate).toHaveBeenCalledWith("settings", "storage");
    await expect(canvas.getByRole("button", { name: "Storage & sync" })).toHaveAttribute("aria-current", "true");
    // The crumb line is hidden in Minimal, so assert presence rather than visibility.
    await expect(canvas.getByText("Storage & sync · Where your work lives")).toBeInTheDocument();
    await expect(canvas.getByText("Nothing waiting for review.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Profile" }));
    await expect(args.onNavigate).toHaveBeenLastCalledWith("account", "profile");
    await expect(canvas.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  },
};
export const Search: Story = {
  async play({ args, canvas, userEvent }) {
    const field = canvas.getByRole("textbox", { name: "Search settings" });
    await userEvent.type(field, "secret");
    await expect(canvas.getByRole("heading", { level: 1, name: "Search" })).toBeVisible();
    // Announced from a status region of its own, which (unlike the crumb) every theme keeps rendered.
    const status = canvas.getByRole("status");
    await expect(status).toHaveTextContent("1 setting match “secret”. Enter opens the first result");
    await expect(status).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Open Account › Profile" }));
    await expect(args.onNavigate).toHaveBeenCalledWith("account", "profile");
    await expect(field).toHaveValue("");
    await waitFor(() => expect(canvas.getByRole("heading", { level: 1, name: "Account" })).toBeVisible());
  },
};
export const SearchKeyboard: Story = {
  async play({ args, canvas, userEvent }) {
    const field = canvas.getByRole("textbox", { name: "Search settings" });
    await userEvent.type(field, "zeppelin");
    await expect(canvas.getByText("No settings match “zeppelin”")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(field).toHaveValue("");
    await userEvent.type(field, "time format{Enter}");
    await expect(args.onNavigate).toHaveBeenCalledWith("settings", "general");
  },
};
/** A page without the nav (Import) uses the same canvas and cards. */
export const PageFrame: Story = {
  render: () => (
    <SettingsPageFrame title="Import" crumb="Bring in Markdown, Trello JSON or CSV">
      <SettingsCard group={{ id: "source", title: "Source", rows: [{ id: "file", label: "File", hint: "Markdown, JSON or CSV up to 5 MB", control: <Button icon="upload">Choose file…</Button> }] }} />
    </SettingsPageFrame>
  ),
};
