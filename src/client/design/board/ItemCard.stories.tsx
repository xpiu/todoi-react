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
  args: { labels: [{ color: "var(--label-blue)", text: "Sales" }], due: "12 Sep", dueState: "overdue", priority: "High", badges: { description: true, checklist: { done: 2, total: 6 }, attachments: 3 }, assignees: ["Todoi", "Sam Verhoeven"] },
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

export const DetailsRow: Story = {
  args: { created: "Aug 12", onQuickAction: fn() },
  parameters: { docs: { description: { story: "Opening the ⋯ menu also expands the details row under the card: the created date and six quick actions, each opening that field's picker in the item overlay. Clicks in the row never open the card." } } },
  async play({ args, canvas, canvasElement, userEvent }) {
    const row = canvas.getByRole("group", { name: "Item details", hidden: true });
    await expect(row.closest(".td-card-details")).not.toHaveAttribute("data-expanded");
    canvas.getByRole("listitem").focus();
    await userEvent.click(canvas.getByRole("button", { name: "Item options" }));
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole("menu");
    await waitFor(() => expect(row.closest(".td-card-details")).toHaveAttribute("data-expanded", "true"));
    await expect(row).toHaveTextContent("Created Aug 12");
    await userEvent.click(within(row).getByRole("button", { name: "Due date" }));
    await expect(args.onQuickAction).toHaveBeenCalledWith("due", "HE-115");
    await expect(args.onClick).not.toHaveBeenCalled();
    await waitFor(() => expect(row.closest(".td-card-details")).not.toHaveAttribute("data-expanded"));
  },
};

export const MenuDrills: Story = {
  args: {
    moveOptions: [
      { value: "l1", label: "New", icon: "circle-dashed", checked: true },
      { value: "l2", label: "Doing", icon: "circle-dot" },
      { value: null, label: "", divider: true },
      { value: "__move", label: "Move to another project…", icon: "folder-input" },
      { value: "__copy", label: "Copy to another project…", icon: "folder-output" },
    ],
  },
  parameters: { docs: { description: { story: "Move to drills into a view inside the same menu (Back, ← or Esc return): the project's lists with the current one checked, then another project. Make subitem of… reports straight away (the host opens the picker)." } } },
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    canvas.getByRole("listitem").focus();
    await userEvent.click(canvas.getByRole("button", { name: "Item options" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Move to" }));
    const menu = await page.findByRole("menu");
    await expect(within(menu).getByText("Move to", { selector: ".td-project-picker-head-title" })).toBeInTheDocument();
    // Esc steps back to the main rows instead of closing the menu
    await userEvent.keyboard("{Escape}");
    await expect(await page.findByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
    await userEvent.click(await page.findByRole("menuitem", { name: "Move to" }));
    await userEvent.click(within(menu).getByText("Doing"));
    await expect(args.onMenuAction).toHaveBeenCalledWith("Move to", "HE-115", "l2");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    canvas.getByRole("listitem").focus();
    await userEvent.click(await canvas.findByRole("button", { name: "Item options" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Make subitem of…" }));
    await expect(args.onMenuAction).toHaveBeenCalledWith("Make subitem of", "HE-115");
  },
};

export const KeyboardOpensMenu: Story = {
  parameters: { docs: { description: { story: "Shift+F10 (or the menu key) on the focused card opens its ⋯ menu; Esc closes it and focus returns to the ⋯." } } },
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    canvas.getByRole("listitem").focus();
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    const menu = await page.findByRole("menu", { name: "Item options" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));
    await expect(args.onMenuAction).toHaveBeenCalledWith("Duplicate", "HE-115");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const CrowdedMetadata: Story = {
  args: {
    due: "Oct 20, 2026", repeat: "Every week", priority: "High", status: "DOING",
    badges: { description: true, checklist: { done: 12, total: 16 }, attachments: 8 },
    assignees: ["Todoi", "Sam Verhoeven", "Ana Peeters", "Jonas Claes"],
  },
  decorators: [(Story) => <div style={{ width: 220 }}><Story /></div>],
  async play({ canvas }) {
    const card = canvas.getByRole("listitem");
    const bounds = card.getBoundingClientRect();
    for (const selector of [".td-card-badges > *", ".td-card-badge .td-meta-text"]) {
      for (const badge of card.querySelectorAll(selector)) {
        if (!badge.getClientRects().length) continue;
        const r = badge.getBoundingClientRect();
        await expect(r.left).toBeGreaterThanOrEqual(bounds.left);
        await expect(r.right).toBeLessThanOrEqual(bounds.right);
      }
    }
    await expect(canvas.getByText("12 of 16")).toBeVisible();
    await expect(canvas.getByText("HE-115")).toBeVisible();
    // A crowded row wraps instead of collapsing to glyphs, so the date keeps its text; the priority badge names its level for themes.
    await expect(card.querySelector(".td-due .td-meta-text")).toBeVisible();
    await expect(card.querySelector('.td-card-badge[data-priority="high"]')).toHaveAttribute("title", "Priority: High");
  },
};
