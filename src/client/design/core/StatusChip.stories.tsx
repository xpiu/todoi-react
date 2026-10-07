import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { StatusChip } from "./StatusChip";
import { STATUSES } from "./statuses";

const meta = {
  title: "Core/StatusChip",
  component: StatusChip,
  args: { status: "DOING" },
  parameters: { docs: { description: { component: "An item's Status as glyph + name. Pass a stable id (\"DOING\"), a display name, or a custom {name, icon, color}; unknown strings fall back to a neutral circle. Items show it only when the user's \"Show Status on items\" preference is on, so the caller decides whether to render it." } } },
} satisfies Meta<typeof StatusChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Doing: Story = {};
export const AllStatuses: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {STATUSES.map((s) => <StatusChip key={s.id} {...args} status={s.id} />)}
    </div>
  ),
};
export const Small: Story = { args: { status: "DONE", size: "sm" } };
export const IconOnly: Story = {
  args: { status: "DONE", iconOnly: true },
  async play({ canvasElement }) {
    await expect(canvasElement.querySelector(".td-status")).toHaveAttribute("title", "Done");
  },
};
export const ByName: Story = { args: { status: "Backlog" } };
export const Custom: Story = { args: { status: { name: "Waiting on dealer", icon: "clock", color: "var(--label-orange)" } } };
export const Unknown: Story = { args: { status: "Parked" } };
