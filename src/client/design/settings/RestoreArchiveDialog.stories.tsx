import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { RestoreArchiveDialog, type RestorePreview } from "./RestoreArchiveDialog";

const PREVIEW: RestorePreview = {
  accountName: "Flo Zimmer",
  exportedAt: "2026-11-25T09:30:00Z",
  groups: 2,
  projects: 3,
  items: 128,
  inboxItems: 4,
  yours: true,
  comments: 41,
  attachments: 6,
  attachmentBytes: 4_812_000,
  projectNames: ["Helicopters Europe website", "Social Media", "Trade show 2027"],
  notes: ["1 other member isn't added to the restored projects. Invite them again.", "12 comments by other people come back under your name, starting with their name and the original date."],
};

const meta = {
  title: "Settings/RestoreArchiveDialog",
  component: RestoreArchiveDialog,
  args: { open: true, stage: "choose", preview: PREVIEW, onClose: fn(), onPick: fn(), onBack: fn(), onRestore: fn(), onOpenProjects: fn() },
  parameters: {
    docs: { description: { component: "Restore what Export everything made, in three stages: choose the .zip → review (who exported it and when, what it creates, what comes back differently) → done. Restored projects are new copies next to yours; nothing existing changes. Pure: the host reads the file (in the browser, JSON only) with the server's own checks." } },
  },
} satisfies Meta<typeof RestoreArchiveDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialogOf = async (canvasElement: HTMLElement) => {
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Restore from an export" });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const Choose: Story = {};
export const NotAnExport: Story = { args: { error: "This file isn't a todoi export. Choose the .zip file that Export everything downloaded." } };
export const Review: Story = {
  args: { stage: "review" },
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    await expect(d.getByText("Your export from Nov 25, 2026")).toBeVisible();
    await expect(d.getByText("2 groups · 3 projects · 128 items · 41 comments · 6 files (4.6 MB)")).toBeVisible();
    await expect(d.getByText("4 Inbox items, which go to your Inbox")).toBeVisible();
    await userEvent.click(d.getByRole("button", { name: "Restore 3 projects" }));
    await expect(args.onRestore).toHaveBeenCalled();
  },
};
export const Restoring: Story = { args: { stage: "review", busy: true } };
export const Done: Story = { args: { stage: "done" } };
