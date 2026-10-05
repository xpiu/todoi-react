import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { ItemCard } from "./ItemCard";

const meta = {
  title: "Board/ItemCard",
  component: ItemCard,
  decorators: [(Story) => <div role="list" aria-label="Board items" style={{ maxWidth: 340 }}><Story /></div>],
  args: { title: "Prepare the helicopter quote", itemId: "HE-115", onClick: fn(), onMenuAction: fn() },
  parameters: { docs: { description: { component: "A board list item with optional cover, labels, due date, progress, and assignees. Wrap cards in a named list. onClick opens the item; onMenuAction delegates changes to application logic." } } },
} satisfies Meta<typeof ItemCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
export const Detailed: Story = {
  args: { labels: [{ color: "var(--label-blue)", text: "Sales" }], due: "12 Sep", dueState: "overdue", priority: "High", badges: { description: true, checklist: { done: 2, total: 6 }, attachments: 3 }, assignees: ["Flo Zuallaert", "Sam Verhoeven"] },
};
export const Completed: Story = { args: { done: true, badges: { checklist: { done: 6, total: 6 } } } };
export const LongTitle: Story = { args: { title: "Prepare a detailed helicopter quote covering delivery dates, optional equipment, maintenance, training, and payment terms" } };
export const Selected: Story = { args: { selected: true } };
export const KeyboardAndMenu: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    canvas.getByRole("listitem").focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Item options" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Archive" }));
    await expect(args.onMenuAction).toHaveBeenCalledWith("Archive", "HE-115");
    await expect(args.onClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
