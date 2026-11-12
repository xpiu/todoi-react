import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { ListRow } from "./ListRow";

const meta = {
  title: "List/ListRow",
  component: ListRow,
  decorators: [(Story) => <div role="list" aria-label="Items" style={{ maxWidth: 820 }}><Story /></div>],
  args: { title: "Prepare the helicopter quote", itemId: "HE-115", onDone: fn(), onClick: fn() },
  parameters: { docs: { description: { component: "One item as a flat row for ListSection, the calendar day list and the inbox. Wrap rows in a named list. The row is a focusable listitem (Enter opens it through onClick) whose checkbox and key stay real buttons; done state is owned by the caller through onDone. Subitems render as an indented nested list." } } },
} satisfies Meta<typeof ListRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Mark done" }));
    await expect(args.onDone).toHaveBeenCalledWith(true);
    await expect(args.onClick).not.toHaveBeenCalled();
    canvas.getByRole("listitem").focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const Detailed: Story = {
  args: {
    labels: [{ color: "orange", text: "Sales" }, { color: "blue", text: "Q4" }],
    due: "Oct 2, 2026",
    dueState: "overdue",
    repeat: "Every month on the 2nd",
    priority: "High",
    attachments: 3,
    assignees: ["Flo Zuallaert", "Sam Verhoeven"],
    status: "DOING",
  },
};
export const Done: Story = { args: { done: true, due: "Sep 28, 2026", dueState: "complete" } };
export const ManyLabelsAndAssignees: Story = {
  args: {
    labels: [{ color: "red", text: "Urgent" }, { color: "teal", text: "Parts" }, { color: "lime", text: "Ops" }, { color: "pink", text: "Finance" }, { color: "yellow", text: "Legal" }],
    assignees: ["Flo Zuallaert", "Sam Verhoeven", "Ana Peeters", "Jonas Claes", "Mia Janssens"],
  },
  async play({ args, canvas, canvasElement, userEvent, globals }) {
    await expect(canvas.getByLabelText("2 more assignees")).toHaveTextContent("+2");
    if (globals.theme === "minimal") {
      // Minimal prints every name inline rather than hiding them behind a count.
      await expect(canvas.getByText("Finance")).toBeVisible();
      await expect(canvas.getByText("Legal")).toBeVisible();
      return;
    }
    const more = canvas.getByRole("button", { name: "2 more labels" });
    await userEvent.hover(more);
    await expect(more).toBeVisible();
    more.focus();
    await userEvent.keyboard("{Enter}");
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: `Labels for ${args.title}` });
    for (const label of ["Urgent", "Parts", "Ops", "Finance", "Legal"]) await waitFor(() => expect(within(panel).getByText(label)).toBeVisible());
    await expect(args.onClick).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(more).toHaveFocus());
    await userEvent.click(more);
    await userEvent.click(await page.findByRole("button", { name: "Close labels" }));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
export const WithSubitems: Story = {
  args: {
    subitems: [
      { title: "Collect the engine hours", itemId: "HE-116", done: true },
      { title: "Price the optional floats", itemId: "HE-117" },
    ],
  },
  async play({ canvas }) {
    const subs = canvas.getByRole("list", { name: "Subitems of Prepare the helicopter quote" });
    await expect(subs.querySelectorAll('[role="listitem"]')).toHaveLength(2);
  },
};
export const Selected: Story = {
  args: { selected: true },
  async play({ canvas }) {
    await expect(canvas.getByText("Selected")).toBeInTheDocument();
  },
};
/** The key is a sibling of the meta group, so it stays on the first line while a long title wraps beside it. */
export const LongTitle: Story = {
  args: { title: "Prepare a detailed helicopter quote covering delivery dates, optional equipment, maintenance, training, insurance, and payment terms for the customer", due: "Oct 20, 2026", labels: [{ color: "orange", text: "Sales" }] },
  decorators: [(Story) => <div style={{ maxWidth: 560 }}><Story /></div>],
  async play({ args, canvas, canvasElement }) {
    const row = canvasElement.querySelector(".td-lrow")!;
    const title = canvas.getByText(args.title).getBoundingClientRect();
    const key = canvas.getByRole("button", { name: `Copy ${args.itemId}` });
    const box = key.getBoundingClientRect();
    await expect(key.parentElement).toBe(row);
    await expect(title.height).toBeGreaterThan(30); // the title wrapped
    await expect(box.bottom).toBeLessThan(title.top + 24); // the key did not
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
  },
};
/** A crowded meta group wraps inside its cap (60% of the row) instead of crushing the title or pushing the key off the first line. */
export const LongTitleManyLabels: Story = {
  args: {
    title: "Prepare a detailed helicopter quote covering delivery dates, optional equipment and payment terms",
    due: "Oct 20, 2026", priority: "Urgent", attachments: 4, assignees: ["Flo Zuallaert", "Sam Verhoeven", "Ana Peeters"],
    labels: [{ color: "red", text: "Compliance paperwork" }, { color: "teal", text: "Spare parts order" }, { color: "lime", text: "Operations" }, { color: "pink", text: "Finance review" }, { color: "yellow", text: "Legal sign-off" }],
  },
  decorators: [(Story) => <div style={{ maxWidth: 560 }}><Story /></div>],
  async play({ args, canvas, canvasElement }) {
    const row = canvasElement.querySelector(".td-lrow")!;
    const width = row.getBoundingClientRect().width;
    const title = canvas.getByText(args.title).getBoundingClientRect();
    const key = canvas.getByRole("button", { name: `Copy ${args.itemId}` }).getBoundingClientRect();
    await expect(canvasElement.querySelector(".td-lrow-end")!.getBoundingClientRect().width).toBeLessThanOrEqual(width * 0.6 + 1);
    await expect(title.width).toBeGreaterThan(width * 0.2);
    await expect(canvasElement.querySelector('.td-lrow-badge[data-priority="urgent"]')).toHaveAttribute("title", "Priority: Urgent");
    await expect(key.bottom).toBeLessThan(title.top + 24);
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
  },
};
export const HiddenKey: Story = { args: { showId: false } };
export const Notification: Story = {
  args: {
    title: "Sam Verhoeven assigned you to “Prepare the helicopter quote”",
    itemId: undefined,
    unread: true,
    created: "Oct 6",
    from: { name: "Sam Verhoeven" },
    about: { key: "HE-115", title: "Prepare the helicopter quote", onOpen: fn() },
  },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Open HE-115" }));
    await expect(args.about!.onOpen).toHaveBeenCalledOnce();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
