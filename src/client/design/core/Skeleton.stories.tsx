import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { Skeleton, ViewSkeleton } from "./Skeleton";

const meta = {
  title: "Core/Skeleton",
  component: Skeleton,
  args: { width: 160 },
  parameters: { docs: { description: { component: "Loading placeholders. Skeleton is one aria-hidden bar or circle for composing a placeholder; ViewSkeleton is the full board / list / inbox placeholder with a visually hidden live label, and paints nothing for the first 150 ms so fast loads never flash. Render ViewSkeleton while a view's query is pending; never show a spinner on the canvas." } } },
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {};
export const Round: Story = { args: { width: 24, height: 24, round: true } };
export const Row: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: 320 }}>
      <Skeleton width={16} height={16} round />
      <Skeleton width="70%" />
      <Skeleton width={36} height={10} />
    </div>
  ),
};
export const BoardView: Story = { render: () => <ViewSkeleton view="board" delay={0} style={{ height: 320 }} /> };
export const ListView: Story = { render: () => <ViewSkeleton view="list" lists={2} delay={0} style={{ height: 320 }} /> };
export const InboxView: Story = { render: () => <ViewSkeleton view="inbox" delay={0} style={{ height: 200 }} /> };
export const DelayedPaint: Story = {
  render: () => <ViewSkeleton view="list" lists={1} label="Loading project…" style={{ height: 200 }} />,
  async play({ canvas, canvasElement }) {
    const status = canvas.getByRole("status");
    await expect(status).toHaveTextContent("Loading project…");
    await expect(canvasElement.querySelector(".td-skview-list")).toBeNull();
    await waitFor(() => expect(canvasElement.querySelector(".td-skview-list")).not.toBeNull());
  },
};
