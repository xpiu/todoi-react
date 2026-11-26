import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import type { ItemPriority } from "../../../shared/enums";
import type { ItemStatus } from "../../../shared/item-status";
import type { QuickField, StatusList } from "../core/itemFields";
import { CardQuickEdit, type QuickEditItem } from "./CardQuickEdit";
import { ItemCard } from "./ItemCard";

const LABELS = [
  { id: "l1", name: "Sales", color: "blue" as const },
  { id: "l2", name: "Design", color: "pink" as const },
  { id: "l3", name: "Legal", color: "orange" as const },
];
const MEMBERS = [
  { id: "u1", name: "Sam Verhoeven" },
  { id: "u2", name: "Todoi" },
];
const PRIORITY_TEXT: Record<ItemPriority, "Urgent" | "High" | "Medium" | "Low"> = { URGENT: "Urgent", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

/** One card with the board's quick-edit state: a quick action opens its picker at the icon, a pick writes the item. */
function Board({ onSessionEnd, onSetPriority, lists = [], linkStatuses, status = null }: { onSessionEnd: (...a: unknown[]) => void; onSetPriority: (...a: unknown[]) => void; lists?: StatusList[]; linkStatuses?: boolean; status?: ItemStatus | null }) {
  const [item, setItem] = useState<QuickEditItem>({ id: "i1", itemId: "HE-115", title: "Prepare the helicopter quote", listId: "todo", start: null, due: "2026-09-12", time: null, labelIds: ["l1"], assigneeIds: [], priority: null, status, done: false });
  const [quick, setQuick] = useState<{ field: QuickField; via: "icon" | "badge" } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const patch = (p: Partial<QuickEditItem>) => setItem((cur) => ({ ...cur, ...p }));
  return (
    <div style={{ maxWidth: 300, minHeight: 420 }}>
      <div role="list" aria-label="Board items">
        <ItemCard
          dragId={item.id}
          title={item.title}
          itemId={item.itemId}
          due={item.due ?? undefined}
          priority={item.priority ? PRIORITY_TEXT[item.priority] : undefined}
          labels={LABELS.filter((l) => item.labelIds.includes(l.id)).map((l) => ({ color: l.color, text: l.name }))}
          assignees={MEMBERS.filter((m) => item.assigneeIds.includes(m.id)).map((m) => m.name)}
          created="Aug 12"
          onMenuAction={fn()}
          onQuickAction={(field, el, source) => {
            anchor.current = el;
            setQuick((q) => (q?.field === field ? null : { field, via: source }));
          }}
          activeQuickAction={quick?.field ?? null}
          quickActionAnchor={quick?.via}
        />
      </div>
      {/* Outside the list: a picker's portal leaves a placeholder where it mounts */}
      {quick ? (
        <CardQuickEdit
          key={quick.field}
          field={quick.field}
          anchorRef={anchor}
          item={item}
          labels={LABELS}
          members={MEMBERS}
          lists={lists}
          linkStatuses={linkStatuses}
          onClose={() => setQuick(null)}
          onSetDates={(_id, v) => patch({ start: v.start, due: v.due, time: v.time })}
          onSetPriority={(...a) => {
            onSetPriority(...a);
            patch({ priority: a[1] });
          }}
          onSetStatus={(_id, next) => patch({ status: next })}
          onSetLabels={(_id, labelIds) => patch({ labelIds })}
          onSetAssignees={(_id, assigneeIds) => patch({ assigneeIds })}
          onSessionEnd={onSessionEnd}
        />
      ) : null}
    </div>
  );
}

const meta = {
  title: "Board/CardQuickEdit",
  component: Board,
  args: { onSessionEnd: fn(), onSetPriority: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "The Board's inline quick pickers: a quick-action icon in a card's details row (⋯ expands it), or one click on the due pill, opens that field's picker at it, so the board stays in view. The card keeps its ring and the icon reads pressed while it is open; a changed badge pops in once. Single picks (dates, priority, Status) save and close; a labels or assignees session saves every tick and reports ONE before → after summary when it closes (the app raises one Undo toast for it). On the board, A, L and Shift+D open Assignees, Labels and Dates on the focused card.",
      },
    },
  },
} satisfies Meta<typeof Board>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Priority: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    canvas.getByRole("listitem").focus();
    await userEvent.click(canvas.getByRole("button", { name: "Item options" }));
    await page.findByRole("menu");
    const icon = canvas.getByRole("button", { name: "Priority", hidden: true });
    await userEvent.click(icon);
    await waitFor(() => expect(icon).toHaveAttribute("aria-expanded", "true"));
    await expect(canvas.getByRole("listitem")).toHaveClass("is-quickedit");
    await expect(page.getByRole("listbox", { name: "Priority for HE-115" }).closest(".td-popover")).toHaveAttribute("id", icon.getAttribute("aria-controls"));
    await userEvent.click(page.getByRole("option", { name: "High" }));
    await expect(args.onSetPriority).toHaveBeenCalledWith("i1", "HIGH", null);
    await waitFor(() => expect(canvas.getByTitle("Priority: High")).toBeInTheDocument());
    await expect(canvas.getByRole("listitem")).not.toHaveClass("is-quickedit");
  },
};

/** "Status follows List" on and the card's list sets its Status: the picker opens locked, with a note to move the card. */
export const StatusSetByList: Story = {
  args: { linkStatuses: true, status: "TODO", lists: [{ id: "todo", statusRole: "TODO" }, { id: "ideas" }] },
  async play({ canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    canvas.getByRole("listitem").focus();
    await userEvent.click(canvas.getByRole("button", { name: "Item options" }));
    await page.findByRole("menu");
    await userEvent.click(canvas.getByRole("button", { name: "Status", hidden: true }));
    await expect(await page.findByRole("option", { name: "Doing" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Move the card to another list to change its Status.")).toBeVisible();
  },
};

export const LabelsSession: Story = {
  parameters: { docs: { description: { story: "Two ticks, one summary: onSessionEnd fires once, when the picker closes, with the set before and after." } } },
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    canvas.getByRole("listitem").focus();
    await userEvent.click(canvas.getByRole("button", { name: "Item options" }));
    await page.findByRole("menu");
    await userEvent.click(canvas.getByRole("button", { name: "Labels", hidden: true }));
    const dialog = await page.findByRole("dialog", { name: "Labels for HE-115" });
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Design/ }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Legal/ }));
    await expect(args.onSessionEnd).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(args.onSessionEnd).toHaveBeenCalledOnce());
    await expect(args.onSessionEnd).toHaveBeenCalledWith("i1", "labels", ["l1"], ["l1", "l2", "l3"]);
  },
};

export const FromTheDuePill: Story = {
  parameters: { docs: { description: { story: "One click on the date opens the dates picker at the pill; the details row stays closed and no icon is pressed." } } },
  async play({ canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const pill = canvas.getByRole("button", { name: /^Due date:/ });
    await userEvent.click(pill);
    await page.findByRole("dialog", { name: "Due date for HE-115" });
    await expect(pill).toHaveAttribute("aria-expanded", "true");
    await expect(canvasElement.querySelector(".td-card-details")).not.toHaveAttribute("data-expanded");
  },
};
