import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { UnreadBadge } from "./UnreadBadge";

const meta = {
  title: "Core/UnreadBadge",
  component: UnreadBadge,
  args: { count: 3 },
  parameters: { docs: { description: { component: "The Inbox unread count: a small action-blue pill (\"99+\" above max) or, with dot, a 6px dot for compact sidebar rows. It renders nothing at zero, so callers pass the count without guarding. Exposed as an image named \"N unread\"; pass label to say more." } } },
} satisfies Meta<typeof UnreadBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Count: Story = {
  async play({ canvas }) {
    await expect(canvas.getByRole("img", { name: "3 unread" })).toHaveTextContent("3");
  },
};
export const Overflow: Story = {
  args: { count: 240 },
  async play({ canvas }) {
    await expect(canvas.getByRole("img", { name: "99+ unread" })).toHaveTextContent("99+");
  },
};
export const Dot: Story = { args: { dot: true, count: 5 } };
export const CustomLabel: Story = { args: { count: 2, label: "2 unread mentions" } };
export const Zero: Story = {
  args: { count: 0 },
  async play({ canvas }) {
    await expect(canvas.queryByRole("img")).not.toBeInTheDocument();
  },
};
