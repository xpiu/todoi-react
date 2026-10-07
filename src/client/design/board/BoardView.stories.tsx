import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { BoardView } from "./BoardView";
import { HiddenListsMenu } from "./HiddenListsMenu";
import { ItemCard, type ItemCardProps } from "./ItemCard";
import { ListColumn } from "./ListColumn";

type Card = ItemCardProps & { id: string };
const BOARD: Array<{ id: string; name: string; cards: Card[] }> = [
  {
    id: "todo",
    name: "To do",
    cards: [
      { id: "c1", itemId: "HE-120", title: "Renew the airworthiness certificate", labels: [{ color: "red", text: "Compliance" }], due: "Oct 14, 2026", priority: "Urgent" },
      { id: "c2", itemId: "HE-121", title: "Order spare rotor blades", labels: [{ color: "teal", text: "Parts" }], badges: { description: true } },
    ],
  },
  {
    id: "doing",
    name: "Doing",
    cards: [
      { id: "c3", itemId: "HE-115", title: "Prepare the helicopter quote", labels: [{ color: "orange", text: "Sales" }], due: "Oct 2, 2026", dueState: "overdue", badges: { checklist: { done: 2, total: 5 } }, assignees: ["Flo Zuallaert"] },
      { id: "c4", itemId: "HE-118", title: "Send the pilot roster", assignees: ["Sam Verhoeven"], badges: { attachments: 2 } },
      { id: "c5", itemId: "HE-119", title: "Schedule the 100-hour inspection", cover: { color: "var(--label-blue)" } },
    ],
  },
  {
    id: "done",
    name: "Done",
    cards: [{ id: "c6", itemId: "HE-101", title: "Hire a second mechanic", done: true, due: "Sep 28, 2026", dueState: "complete" }],
  },
];

const meta = {
  title: "Board/BoardView",
  component: BoardView,
  decorators: [(Story) => <div style={{ height: 520 }}><Story /></div>],
  args: { onAddList: fn(), onItemKey: fn(), onItemSelect: fn(), onMoveItem: fn() },
  render: (args) => (
    <BoardView {...args}>
      {BOARD.map((list) => (
        <ListColumn key={list.id} listId={list.id} name={list.name} count={list.cards.length}>
          {list.cards.map(({ id, ...card }) => (
            <ItemCard key={id} dragId={id} {...card} />
          ))}
        </ListColumn>
      ))}
    </BoardView>
  ),
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The assembled board canvas: ListColumns of ItemCards, horizontal scroll, and \"Add another list\". The whole board is one Tab stop through KeyNav; cards need dragId so keyboard moves, item keys and selection report their ids. Pass the HiddenListsMenu as `after` and drag-and-drop handlers through rootProps." } },
  },
} satisfies Meta<typeof BoardView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const WithHiddenLists: Story = {
  args: { after: <HiddenListsMenu lists={[{ id: "backlog", name: "Backlog", count: 7 }, { id: "ideas", name: "Ideas", count: 3 }]} onShow={fn()} /> },
};
export const Empty: Story = {
  render: (args) => <BoardView {...args} />,
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Add another list" }));
    await expect(args.onAddList).toHaveBeenCalledOnce();
  },
};
export const ReadOnly: Story = { args: { showAddList: false } };

export const KeyboardNavigation: Story = {
  async play({ args, canvas, userEvent }) {
    const card = (title: string) => canvas.getByText(title).closest<HTMLElement>(".td-card")!;
    card("Renew the airworthiness certificate").focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(card("Order spare rotor blades")).toHaveFocus();
    // ←/→ cross columns, keeping the row where the next column has one.
    await userEvent.keyboard("{ArrowRight}");
    await expect(card("Send the pilot roster")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(card("Hire a second mechanic")).toHaveFocus();
    await userEvent.keyboard("d");
    await expect(args.onItemKey).toHaveBeenCalledWith("c6", "done");
    await userEvent.keyboard("s");
    await expect(args.onItemSelect).toHaveBeenCalledWith(["c6"], "toggle");
    await userEvent.keyboard("{Control>}{ArrowLeft}{/Control}");
    await expect(args.onMoveItem).toHaveBeenCalledWith("c6", "left");
  },
};
export const OneTabStop: Story = {
  async play({ canvasElement }) {
    // Roving tabindex: exactly one card is in the Tab order.
    const cards = [...canvasElement.querySelectorAll<HTMLElement>(".td-card")];
    await expect(cards.filter((c) => c.tabIndex === 0)).toHaveLength(1);
  },
};
