import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import type { ProjectVisibility } from "../../../shared/enums";
import { Button } from "../core/Button";
import { Popover, usePopover } from "../core/Popover";
import type { PanelMember } from "../project/ProjectPanel";
import { MembersMenu, type MembersMenuProps } from "./MembersMenu";

const MEMBERS: PanelMember[] = [
  { id: "u1", name: "Flo Zuallaert", email: "flo@todoi.com", color: "var(--label-teal)", role: "owner" },
  { id: "u2", name: "Sam Verhoeven", email: "sam@todoi.com", color: "var(--label-orange)", role: "admin" },
  { id: "u3", name: "Noor El Amrani", email: "noor@todoi.com", color: "var(--label-pink)", role: "editor" },
  { id: "u4", name: "Jan De Smet", color: "var(--label-blue)", role: "viewer" },
];

// MembersMenu is a Popover body (its Invite row is a PopoverClose), so the story hosts it the way the
// SubNavbar does: a toolbar-tier dialog Popover. The host owns visibility.
function MembersPopover(args: MembersMenuProps) {
  const pop = usePopover();
  const [visibility, setVisibility] = useState<ProjectVisibility>(args.visibility);
  return (
    <Popover open={pop.open} onOpenChange={pop.setOpen} tier="toolbar" role="dialog" aria-label="Project members and sharing" width={320} className="td-pop-flush" trigger={<Button icon="users">Members</Button>}>
      <MembersMenu
        {...args}
        visibility={visibility}
        onVisibilityChange={(v) => {
          setVisibility(v);
          args.onVisibilityChange(v);
        }}
      />
    </Popover>
  );
}

const meta = {
  title: "Navigation/MembersMenu",
  component: MembersMenu,
  render: (args) => <MembersPopover {...args} />,
  args: { members: MEMBERS, currentUserId: "u1", canManage: true, visibility: "private", url: "https://todoi.app/p/helicopters-europe", onVisibilityChange: fn(), onChangeRole: fn(), onInvite: fn() },
  parameters: { docs: { description: { component: "The Members action's panel: the roster with roles, Invite people, the Visibility radio group and the copyable project link. It must render inside a Popover (SubNavbar's `membersMenu`), because Invite closes it via PopoverClose. The host owns members, roles and visibility; canManage unlocks the role pickers and visibility." } } },
} satisfies Meta<typeof MembersMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

const openMenu = async (canvasElement: HTMLElement, userEvent: { click: (el: Element) => Promise<void> }) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Members" }));
  const page = within(canvasElement.ownerDocument.body);
  const dialog = await page.findByRole("dialog", { name: "Project members and sharing" });
  await waitFor(() => expect(dialog).toBeVisible());
  return { page, dialog: within(dialog) };
};

export const Admin: Story = {
  async play({ args, canvasElement, userEvent }) {
    const { dialog, page } = await openMenu(canvasElement, userEvent);
    await expect(dialog.getByText("Flo Zuallaert (you)")).toBeVisible();
    await userEvent.click(dialog.getByRole("radio", { name: /Shared/ }));
    await expect(args.onVisibilityChange).toHaveBeenCalledWith("shared");
    await expect(dialog.getByRole("radio", { name: /Shared/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(dialog.getByRole("combobox", { name: "Role for Jan De Smet" }));
    await userEvent.click(await page.findByRole("option", { name: "Editor" }));
    await expect(args.onChangeRole).toHaveBeenCalledWith(expect.objectContaining({ id: "u4" }), "editor");
  },
};
export const InvitePeople: Story = {
  async play({ args, canvasElement, userEvent }) {
    const { dialog, page } = await openMenu(canvasElement, userEvent);
    await userEvent.click(dialog.getByRole("button", { name: "Invite people…" }));
    await expect(args.onInvite).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Project members and sharing" })).not.toBeInTheDocument());
  },
};
export const ReadOnly: Story = {
  args: { canManage: false, currentUserId: "u4", visibility: "public" },
  async play({ canvasElement, userEvent }) {
    const { dialog } = await openMenu(canvasElement, userEvent);
    await expect(dialog.queryByRole("combobox")).not.toBeInTheDocument();
    await expect(dialog.queryByRole("button", { name: "Invite people…" })).not.toBeInTheDocument();
    for (const radio of dialog.getAllByRole("radio")) await expect(radio).toBeDisabled();
    await expect(dialog.getByText("Only admins can change roles or visibility.")).toBeVisible();
  },
};
/** Two panels at once (Storybook docs, a second project): each radio group is labelled by its own heading. */
export const TwoPanels: Story = {
  args: { canManage: false, onInvite: undefined },
  render: (args) => (
    <div style={{ display: "flex", gap: 16 }}>
      <MembersMenu {...args} />
      <MembersMenu {...args} visibility="shared" />
    </div>
  ),
  async play({ canvas }) {
    const groups = canvas.getAllByRole("radiogroup", { name: "Visibility" });
    await expect(groups).toHaveLength(2);
    await expect(groups[0]!.getAttribute("aria-labelledby")).not.toBe(groups[1]!.getAttribute("aria-labelledby"));
  },
};
