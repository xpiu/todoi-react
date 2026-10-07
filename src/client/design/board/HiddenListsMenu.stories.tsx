import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { HiddenListsMenu } from "./HiddenListsMenu";

const meta = {
  title: "Board/HiddenListsMenu",
  component: HiddenListsMenu,
  args: {
    lists: [
      { id: "backlog", name: "Backlog", count: 4 },
      { id: "on-hold", name: "On hold", count: 0 },
    ],
    onShow: fn(),
  },
  parameters: { docs: { description: { component: "The way back to hidden lists, passed as `after` to BoardView or ListView. Renders nothing when no list is hidden. The caller owns which lists are hidden; onShow receives the ids to show again (one list, or all of them through Show all)." } } },
} satisfies Meta<typeof HiddenListsMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ShowOne: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "2 hidden lists" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    // Base UI labels the popup by its trigger (aria-labelledby wins over MenuPopover's label).
    const menu = await page.findByRole("menu", { name: "2 hidden lists" });
    await waitFor(() => expect(within(menu).getByText("Hidden lists and their items are hidden for everyone in this project.")).toBeVisible());
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Show “Backlog”/ }));
    await expect(args.onShow).toHaveBeenCalledWith(["backlog"]);
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const ShowAll: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "2 hidden lists" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Show all" }));
    await expect(args.onShow).toHaveBeenCalledWith(["backlog", "on-hold"]);
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const SingleList: Story = {
  args: { lists: [{ id: "backlog", name: "Backlog", count: 12 }] },
  async play({ canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "1 hidden list" }));
    const page = within(canvasElement.ownerDocument.body);
    const item = await page.findByRole("menuitem", { name: /Show “Backlog”/ });
    await waitFor(() => expect(item).toBeVisible());
    await expect(page.queryByRole("menuitem", { name: "Show all" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const NothingHidden: Story = {
  args: { lists: [] },
  async play({ canvas }) {
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};
