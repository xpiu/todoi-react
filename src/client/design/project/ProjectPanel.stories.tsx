import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import type { ActivityEntryView } from "./ActivityLog";
import { ProjectPanel, type PanelMember, type PanelProject } from "./ProjectPanel";

const PROJECT: PanelProject = {
  id: "p1",
  name: "Helicopter sales",
  icon: "rocket",
  color: "orange",
  description: "Quotes, demos and follow-ups for the Benelux market.",
  visibility: "shared",
  defaultView: "board",
  linkStatuses: true,
  groupId: "g1",
  groupName: "Helicopters Europe",
  keyPrefix: "HE",
  url: "https://todoi.app/p/helicopter-sales",
  role: "owner",
};
const MEMBERS: PanelMember[] = [
  { id: "u1", name: "Flo Zuallaert", email: "flo@todoi.com", color: "var(--label-teal)", role: "owner" },
  { id: "u2", name: "Sam Verhoeven", email: "sam@todoi.com", color: "var(--label-orange)", role: "admin" },
  { id: "u3", name: "Jan De Smet", color: "var(--label-blue)", role: "viewer" },
];
// ProjectPanel does not pass `now` to its ActivityLog, so entries are relative to the story's load time.
const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const ACTIVITY: ActivityEntryView[] = [
  { id: "a1", type: "item", actor: "Flo Zuallaert", actorColor: "var(--label-teal)", text: "moved the quote to Doing", key: "HE-115", time: ago(5) },
  { id: "a2", type: "member", actor: "Sam Verhoeven", actorColor: "var(--label-orange)", text: "invited jan@todoi.com as a viewer", time: ago(60 * 30) },
];

const meta = {
  title: "Project/ProjectPanel",
  component: ProjectPanel,
  args: { open: true, project: PROJECT, members: MEMBERS, activity: ACTIVITY, archivedCount: 3, currentUserId: "u1", onChange: fn(), onAction: fn(), onChangeRole: fn(), onRemoveMember: fn(), onInvite: fn(), onOpenKey: fn(), onClose: fn() },
  parameters: { docs: { description: { component: "The project's settings in one scrolling Dialog: Name, Access, Members, Defaults, Appearance, Leave and archive, Activity. The caller owns the project, members and activity and applies each patch from onChange; a rejected promise reverts the field. The viewer's `project.role` decides what is editable, destructive rows confirm inline, and `section` scrolls to Members or Activity on open." } } },
} satisfies Meta<typeof ProjectPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

const panelOf = async (canvasElement: HTMLElement) => {
  const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: /Helicopter sales/ });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

export const Owner: Story = {
  async play({ args, canvasElement, userEvent }) {
    const panel = await panelOf(canvasElement);
    const name = panel.getByRole("textbox", { name: "Project name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Helicopter sales Benelux{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith({ name: "Helicopter sales Benelux" });
    await userEvent.click(panel.getByRole("switch", { name: "Link lists with statuses" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ linkStatuses: false });
  },
};
export const ConfirmDelete: Story = {
  async play({ args, canvasElement, userEvent }) {
    const panel = await panelOf(canvasElement);
    await userEvent.click(panel.getByRole("button", { name: "Delete" }));
    await expect(panel.getByText("Delete “Helicopter sales”?")).toBeVisible();
    await userEvent.click(panel.getByRole("button", { name: "Delete" }));
    await expect(args.onAction).toHaveBeenCalledWith("delete");
  },
};
export const InviteMember: Story = {
  args: { section: "members" },
  async play({ args, canvasElement, userEvent }) {
    const panel = await panelOf(canvasElement);
    const invite = panel.getByRole("button", { name: "Invite" });
    await expect(invite).toBeDisabled();
    await userEvent.type(panel.getByRole("textbox", { name: "Invite by email" }), "noor@todoi.com");
    await userEvent.click(invite);
    await expect(args.onInvite).toHaveBeenCalledWith("noor@todoi.com", "editor");
    await waitFor(() => expect(panel.getByRole("textbox", { name: "Invite by email" })).toHaveValue(""));
    await userEvent.click(panel.getByRole("button", { name: "Remove Jan De Smet" }));
    await expect(args.onRemoveMember).toHaveBeenCalledWith(expect.objectContaining({ id: "u3" }));
  },
};
export const InviteFails: Story = {
  args: { section: "members", onInvite: fn(() => Promise.reject(new Error("that address already has access"))) },
  async play({ canvasElement, userEvent }) {
    const panel = await panelOf(canvasElement);
    await userEvent.type(panel.getByRole("textbox", { name: "Invite by email" }), "sam@todoi.com{Enter}");
    await expect(await panel.findByText(/Couldn't invite: that address already has access/)).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "Invite by email" })).toHaveValue("sam@todoi.com");
  },
};
/** A viewer sees the settings read-only and can only leave. */
export const Viewer: Story = {
  args: { project: { ...PROJECT, role: "viewer" }, currentUserId: "u3" },
  async play({ args, canvasElement, userEvent }) {
    const panel = await panelOf(canvasElement);
    await expect(panel.getByRole("textbox", { name: "Project name" })).toBeDisabled();
    await expect(panel.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    await expect(panel.getByText("Only admins can invite people or change roles.")).toBeVisible();
    await userEvent.click(panel.getByRole("button", { name: "Leave" }));
    await userEvent.click(panel.getByRole("button", { name: "Leave" }));
    await expect(args.onAction).toHaveBeenCalledWith("leave");
  },
};
export const Closes: Story = {
  async play({ args, canvasElement, userEvent }) {
    const panel = await panelOf(canvasElement);
    await userEvent.click(panel.getByRole("button", { name: "Close project settings" }));
    await expect(args.onClose).toHaveBeenCalledWith("close");
  },
};
