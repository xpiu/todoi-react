import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { IconButton } from "../core/IconButton";
import { MenuPopover } from "../core/Menu";
import { ListActionsMenu, type ListActionsMenuProps } from "./ListActionsMenu";

// The rows only render inside a menu: model the ⋯ trigger ListColumn and ListSection give them.
function ListMenu(args: ListActionsMenuProps) {
  return (
    <MenuPopover label={`Actions for ${args.name}`} placement="bottom-start" trigger={<IconButton name="ellipsis" label={`List actions for ${args.name}`} />}>
      {(close) => (
        <ListActionsMenu
          {...args}
          onClose={() => {
            close();
            args.onClose?.();
          }}
        />
      )}
    </MenuPopover>
  );
}

const meta = {
  title: "Board/ListActionsMenu",
  component: ListActionsMenu,
  render: (args) => <ListMenu {...args} />,
  args: { name: "Doing", statusRole: "DOING", activeIcon: null, onStatusRoleChange: fn(), onManageLinks: fn(), onClose: fn(), onStartRename: fn(), onIconChange: fn(), onSelectAll: fn(), onHide: fn() },
  parameters: { docs: { description: { component: "The rows of a list's ⋯ menu, shared by the board column and the list section. Render it inside a MenuPopover and pass its close function as onClose. Icon and Status role drill into sub-views in the same popup; every change is reported through callbacks and the caller persists it." } } },
} satisfies Meta<typeof ListActionsMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rename: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole("menu", { name: "Actions for Doing" });
    await expect(within(menu).getByRole("menuitem", { name: /Status role/ })).toHaveTextContent("Doing");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Rename" }));
    await expect(args.onStartRename).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const SelectAllAndHide: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "List actions for Doing" });
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(trigger);
    await userEvent.click(await page.findByRole("menuitem", { name: "Select all" }));
    await expect(args.onSelectAll).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await userEvent.click(trigger);
    await userEvent.click(await page.findByRole("menuitem", { name: "Hide" }));
    await expect(args.onHide).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const StatusRole: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: /Status role/ }));
    const doing = await page.findByRole("menuitemradio", { name: "Doing" });
    await expect(doing).toHaveAttribute("aria-checked", "true");
    await userEvent.click(page.getByRole("menuitemradio", { name: "Done" }));
    await expect(args.onStatusRoleChange).toHaveBeenCalledWith("DONE");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const SuggestedRole: Story = {
  args: { name: "In progress", statusRole: null },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "List actions for In progress" }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("menuitem", { name: /Status role/ })).toHaveTextContent("None");
    await userEvent.click(page.getByRole("menuitem", { name: /Status role/ }));
    await expect(await page.findByRole("menuitemradio", { name: /Doing/ })).toHaveTextContent("Suggested");
    await expect(page.getByRole("menuitemradio", { name: "None" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(page.getByRole("menuitem", { name: "Manage list–status links…" }));
    await expect(args.onManageLinks).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const ChooseIcon: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "List actions for Doing" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: /Icon/ }));
    const picker = await page.findByRole("group", { name: "List icon" });
    await userEvent.click(within(picker).getByRole("button", { name: "Blocked" }));
    await expect(args.onIconChange).toHaveBeenCalledWith("circle-alert");
    await expect(args.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
