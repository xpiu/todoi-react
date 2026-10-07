import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { ActivityLog, type ActivityEntryView } from "./ActivityLog";

// Local times with a fixed `now` keep the day groups and relative times deterministic.
const NOW = new Date("2026-10-07T15:00:00").getTime();
const ENTRIES: ActivityEntryView[] = [
  { id: "a1", type: "item", actor: "Flo Zuallaert", actorColor: "var(--label-teal)", text: "moved the quote to Doing", key: "HE-115", time: "2026-10-07T14:52:00" },
  { id: "a2", type: "comment", actor: "Sam Verhoeven", actorColor: "var(--label-orange)", text: "commented on", key: "HE-112", time: "2026-10-07T11:20:00" },
  { id: "a3", type: "list", actor: "Flo Zuallaert", actorColor: "var(--label-teal)", text: "added the list Backlog", time: "2026-10-06T16:05:00" },
  { id: "a4", type: "member", actor: "Flo Zuallaert", actorColor: "var(--label-teal)", text: "invited noor@todoi.com as an editor", time: "2026-10-03T09:30:00" },
  { id: "a5", type: "settings", actor: "Sam Verhoeven", actorColor: "var(--label-orange)", text: "made the project shared", time: "2026-09-12T10:00:00" },
  { id: "a6", type: "item", actor: "Sam Verhoeven", actorColor: "var(--label-orange)", text: "completed", key: "HE-98", time: "2025-12-18T08:45:00" },
];

const meta = {
  title: "Project/ActivityLog",
  component: ActivityLog,
  decorators: [(Story) => <div style={{ maxWidth: 600 }}><Story /></div>],
  args: { entries: ENTRIES, now: NOW, onOpenKey: fn() },
  parameters: { docs: { description: { component: "The read-only project log, grouped by day with relative times. The caller supplies the entries (and `now` for stable times); the log keeps only its kind/person filters and the \"Show older\" page. Item keys become buttons when onOpenKey is given. ProjectPanel composes it as its Activity section." } } },
} satisfies Meta<typeof ActivityLog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByText("Today")).toBeVisible();
    await expect(canvas.getByText("Yesterday")).toBeVisible();
    await expect(canvas.getByText("8 minutes ago")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "HE-115" }));
    await expect(args.onOpenKey).toHaveBeenCalledWith("HE-115");
  },
};
export const FilterByKind: Story = {
  async play({ canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Kind" }));
    await userEvent.click(await page.findByRole("option", { name: "Comments" }));
    await expect(canvas.getByText("1 entry · filtered")).toBeVisible();
    await userEvent.click(canvas.getByRole("combobox", { name: "Person" }));
    await userEvent.click(await page.findByRole("option", { name: "Flo Zuallaert" }));
    await expect(canvas.getByText("Nothing matches these filters")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Show all activity" }));
    await expect(canvas.getByText("6 entries")).toBeVisible();
    await waitFor(() => expect(page.queryByRole("listbox")).not.toBeInTheDocument());
  },
};
export const Paged: Story = {
  args: { pageSize: 3 },
  async play({ canvas, userEvent }) {
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "Show older" }));
    await expect(canvas.getAllByRole("listitem")).toHaveLength(6);
    await expect(canvas.queryByRole("button", { name: "Show older" })).not.toBeInTheDocument();
  },
};
export const ReadOnlyKeys: Story = { args: { onOpenKey: undefined, filters: false } };
export const Empty: Story = { args: { entries: [] } };
