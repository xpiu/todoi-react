import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import type { MergeConflict } from "../../../shared/projectDoc/merge";
import { GitConflictDialog } from "./GitConflictDialog";

const CONFLICTS: MergeConflict[] = [
  { key: "field:a1b2c3d:title", kind: "field", id: "a1b2c3d", title: "Update hull copy", field: "title", base: "Update hull copy", ours: "Update hull coverage copy", theirs: "Update hull cover copy" },
  { key: "field:a1b2c3d:due", kind: "field", id: "a1b2c3d", title: "Update hull copy", field: "due", base: "2026-09-20", ours: "2026-09-22", theirs: "2026-09-21" },
  { key: "field:k9x8y7z:place", kind: "field", id: "k9x8y7z", title: "Book the photographer", field: "place", base: "list:doing", ours: "list:doing", theirs: "list:todo" },
  { key: "edited-deleted:q1w2e3r", kind: "edited-deleted", id: "q1w2e3r", title: "Retro notes" },
];

const meta = {
  title: "Settings/GitConflictDialog",
  component: GitConflictDialog,
  args: { open: true, repoName: "acme/plans", conflicts: CONFLICTS, places: { "list:doing": "Doing", "list:todo": "To-do" }, onClose: fn(), onApply: fn() },
  parameters: {
    docs: { description: { component: "Resolve GitHub sync conflict: each thing that changed in todoi and in the file since the last sync, with its three versions and a choice per conflict (or one side for all). Apply stays disabled until every conflict is decided; Leave paused keeps the sync paused. Values read as todoi shows them." } },
  },
} satisfies Meta<typeof GitConflictDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PickPerConflict: Story = {
  async play({ args, canvasElement, userEvent }) {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Resolve GitHub sync conflict" });
    await waitFor(() => expect(dialog).toBeVisible());
    const d = within(dialog);
    await expect(d.getByText("In “To-do”")).toBeVisible();
    await expect(d.getByText("Changed in todoi, deleted in the file")).toBeVisible();
    // A title conflict is named by the title it had.
    await expect(dialog.querySelector(".td-git-conflict-title")?.firstChild?.textContent).toBe("Update hull copy");
    const apply = d.getByRole("button", { name: "Apply and sync" });
    await expect(apply).toBeDisabled();
    await userEvent.click(d.getByRole("button", { name: "Keep todoi's for all" }));
    await userEvent.click(d.getByRole("button", { name: "Keep the file's Update hull cover copy" }));
    await expect(apply).toBeEnabled();
    await userEvent.click(apply);
    await expect(args.onApply).toHaveBeenCalledWith({ "field:a1b2c3d:title": "theirs", "field:a1b2c3d:due": "ours", "field:k9x8y7z:place": "ours", "edited-deleted:q1w2e3r": "ours" });
  },
};
export const OneConflict: Story = { args: { conflicts: CONFLICTS.slice(0, 1) } };
export const Syncing: Story = { args: { busy: true } };
export const Failed: Story = { args: { error: "GitHub didn't answer. Try again in a minute" } };
