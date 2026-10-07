import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { FilterChip } from "./FilterChip";

const meta = {
  title: "Board/FilterChip",
  component: FilterChip,
  // Filter chips sit on the chrome canvas of the subnavbar.
  decorators: [(Story) => <div style={{ display: "flex", gap: 8, padding: 12, background: "var(--chrome-canvas)" }}><Story /></div>],
  args: { value: "Sales", category: "label", color: "var(--label-blue)", onClick: fn(), onRemove: fn() },
  parameters: { docs: { description: { component: "A filter toggle on the chrome canvas, used by FilterBar. The caller owns the filter state: selected chips show a × and call onRemove, unselected chips call onClick. Keep active filters rendered as chips so a filtered view never silently looks empty." } } },
} satisfies Meta<typeof FilterChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {
  async play({ args, canvas, userEvent }) {
    const chip = canvas.getByRole("button", { name: /Sales/ });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    await expect(args.onRemove).toHaveBeenCalledOnce();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
export const Unselected: Story = {
  args: { selected: false },
  async play({ args, canvas, userEvent }) {
    const chip = canvas.getByRole("button", { name: /Sales/ });
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    await expect(args.onClick).toHaveBeenCalledOnce();
    await expect(args.onRemove).not.toHaveBeenCalled();
  },
};
export const WithIcon: Story = { args: { value: "Overdue", category: undefined, color: undefined, icon: "clock" } };
export const PlainValue: Story = { args: { value: "Assigned to me", category: undefined, color: undefined, selected: false } };
export const RemoveFallsBackToClick: Story = {
  args: { onRemove: undefined },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: /Sales/ }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
