import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { GitConnectDialog, type GitConnectDialogProps } from "./GitConnectDialog";

const TOKEN = "github_pat_11ABCDEFG0123456789_storybook";

/** Opened from a row's button, as in Settings › Storage & sync, so focus can return to it. */
function FromRow(args: GitConnectDialogProps) {
  const [open, setOpen] = useState(args.open);
  return (
    <>
      <Button icon="git-branch" onClick={() => setOpen(true)}>
        Connect
      </Button>
      <GitConnectDialog
        {...args}
        open={open}
        onClose={(reason) => {
          setOpen(false);
          args.onClose(reason);
        }}
      />
    </>
  );
}

const meta = {
  title: "Settings/GitConnectDialog",
  component: GitConnectDialog,
  render: (args) => <FromRow key={String(args.open)} {...args} />,
  args: { open: true, projectName: "Website", itemCount: 12, defaultPath: "todo/website.md", onClose: fn(), onCheck: fn(), onConnect: fn(), onEdit: fn() },
  parameters: {
    docs: { description: { component: "Connect a project to a file in a GitHub repository in two stages: the form (repository — a pasted GitHub link fills the branch and file too —, branch, file, format, a fine-grained token, the conflict policy) → what the check found, which decides the one thing connecting does: **Store new file** when the file isn't there, **Replace with file** when it is (its lists and items replace the project's, which go to the Trash; Undo under Recent syncs brings them back). Pure: the host checks and connects, and passes `checked` back." } },
  },
} satisfies Meta<typeof GitConnectDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialogOf = async (canvasElement: HTMLElement) => {
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Connect a repository" });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const FillAndCheck: Story = {
  async play({ args, canvasElement, userEvent }) {
    const d = await dialogOf(canvasElement);
    await userEvent.click(d.getByRole("button", { name: "Check repository" }));
    await expect(d.getByText("Enter the repository, like acme/plans, or paste its GitHub link.")).toBeVisible();
    await expect(d.getByText("Paste the token from GitHub.")).toBeVisible();
    // A link to the file fills the branch, the file and the format.
    await userEvent.type(d.getByLabelText("Repository"), "https://github.com/acme/plans/blob/dev/tasks/site.yaml");
    await expect(d.getByLabelText("Branch")).toHaveValue("dev");
    await expect(d.getByLabelText("File")).toHaveValue("tasks/site.yaml");
    await userEvent.click(d.getByRole("button", { name: "Markdown" }));
    await expect(d.getByLabelText("File")).toHaveValue("tasks/site.md");
    await userEvent.type(d.getByLabelText("GitHub token"), TOKEN);
    await userEvent.click(d.getByRole("button", { name: "Check repository" }));
    await expect(args.onCheck).toHaveBeenCalledWith({ owner: "acme", repo: "plans", branch: "dev", path: "tasks/site.md", format: "embridge", token: TOKEN, conflictPolicy: "ask" });
  },
};
export const StoreNewFile: Story = { args: { checked: { fullName: "acme/plans", private: true, fileExists: false } } };
export const UseExistingFile: Story = {
  args: { checked: { fullName: "acme/plans", private: false, fileExists: true } },
  async play({ canvasElement }) {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Ready to connect" });
    await waitFor(() => expect(dialog).toBeVisible());
    const d = within(dialog);
    await expect(d.getByText("This repository is public")).toBeVisible();
    await expect(d.getByText("Connecting replaces the 12 items in", { exact: false })).toBeVisible();
    await expect(d.getByRole("button", { name: "Replace with file" })).toBeEnabled();
  },
};
export const GitHubRefused: Story = { args: { error: "GitHub didn't accept the token. It may have expired or been revoked; connect again with a new token" } };
export const Checking: Story = { args: { busy: true } };
export const Offline: Story = { args: { offline: true } };
