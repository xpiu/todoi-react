import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { HiddenListsMenu } from "../board/HiddenListsMenu";
import { ListRow, type ListRowProps } from "./ListRow";
import { ListSection } from "./ListSection";
import { ListView } from "./ListView";

type Row = ListRowProps & { id: string };
const LISTS: Array<{ id: string; name: string; rows: Row[] }> = [
  {
    id: "todo",
    name: "To do",
    rows: [
      { id: "r1", itemId: "HE-120", title: "Renew the airworthiness certificate", labels: [{ color: "red", text: "Compliance" }], due: "Oct 14, 2026", priority: "Urgent" },
      { id: "r2", itemId: "HE-121", title: "Order spare rotor blades", labels: [{ color: "teal", text: "Parts" }], assignees: ["Ana Peeters"] },
    ],
  },
  {
    id: "doing",
    name: "Doing",
    rows: [
      {
        id: "r3",
        itemId: "HE-115",
        title: "Prepare the helicopter quote",
        labels: [{ color: "orange", text: "Sales" }],
        due: "Oct 2, 2026",
        dueState: "overdue",
        assignees: ["Flo Zuallaert"],
        subitems: [
          { title: "Collect the engine hours", itemId: "HE-116", done: true, dragId: "r3/s1" },
          { title: "Price the optional floats", itemId: "HE-117", dragId: "r3/s2" },
        ],
      },
      { id: "r4", itemId: "HE-118", title: "Send the pilot roster", attachments: 2, repeat: "Every Monday" },
    ],
  },
  {
    id: "done",
    name: "Done",
    rows: [{ id: "r5", itemId: "HE-101", title: "Hire a second mechanic", done: true, due: "Sep 28, 2026", dueState: "complete" }],
  },
];

const meta = {
  title: "List/ListView",
  component: ListView,
  args: { onAddList: fn(), onItemKey: fn(), onItemSelect: fn(), onMoveItem: fn() },
  render: (args) => (
    <ListView {...args}>
      {LISTS.map((list) => (
        <ListSection key={list.id} listId={list.id} name={list.name} count={list.rows.length}>
          {list.rows.map(({ id, ...row }) => (
            <ListRow key={id} dragId={id} {...row} />
          ))}
        </ListSection>
      ))}
    </ListView>
  ),
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The assembled List view: ListSections of ListRows centred at 900px, ending in \"Add another list\". The view is one Tab stop through KeyNav; rows need dragId so keyboard moves, item keys and selection report their ids (subitem ids contain a \"/\" and are not moved or selected). Pass the HiddenListsMenu as `after` and drag-and-drop handlers through rootProps." } },
  },
} satisfies Meta<typeof ListView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const WithHiddenLists: Story = {
  args: { after: <HiddenListsMenu lists={[{ id: "backlog", name: "Backlog", count: 7 }]} onShow={fn()} /> },
};
export const Empty: Story = {
  render: (args) => <ListView {...args} />,
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Add another list" }));
    await expect(args.onAddList).toHaveBeenCalledOnce();
  },
};
export const KeyboardNavigation: Story = {
  async play({ args, canvas, userEvent }) {
    const row = (title: string) => canvas.getByText(title).closest<HTMLElement>(".td-lrow")!;
    row("Order spare rotor blades").focus();
    // ↓ crosses into the next section, and through subitem rows.
    await userEvent.keyboard("{ArrowDown}");
    await expect(row("Prepare the helicopter quote")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(row("Collect the engine hours")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("d");
    await expect(args.onItemKey).toHaveBeenCalledWith("r3", "done");
    await userEvent.keyboard("s");
    await expect(args.onItemSelect).toHaveBeenCalledWith(["r3"], "toggle");
    await userEvent.keyboard("{Control>}{ArrowDown}{/Control}");
    await expect(args.onMoveItem).toHaveBeenCalledWith("r3", "down");
  },
};
