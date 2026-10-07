import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { LABEL_COLORS } from "../../../shared/enums";
import { LabelChip } from "./LabelChip";

const meta = {
  title: "Board/LabelChip",
  component: LabelChip,
  args: { color: "blue", text: "Sales" },
  parameters: { docs: { description: { component: "A label in one of three forms: a compact 40×8 bar (no text, board cards), a small pill (size \"sm\", list rows and quick-add previews), or a 32px chip (expanded, the item overlay). Pass a palette name for the theme's label tokens and ink, or any CSS colour for a custom label." } } },
} satisfies Meta<typeof LabelChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Chip: Story = {};
export const Small: Story = { args: { size: "sm" } };
export const Expanded: Story = { args: { expanded: true } };
export const Bar: Story = {
  args: { text: undefined },
  async play({ canvasElement }) {
    const bar = canvasElement.querySelector(".td-label");
    await expect(bar).toHaveAttribute("data-form", "bar");
    await expect(bar).toHaveAttribute("title", "blue");
  },
};
export const CustomColor: Story = { args: { color: "var(--blue-500)", text: "Design review" } };
export const Palette: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {LABEL_COLORS.map((c) => (
        <LabelChip key={c} {...args} color={c} text={c} />
      ))}
    </div>
  ),
  async play({ canvasElement }) {
    await expect(canvasElement.querySelectorAll(".td-label")).toHaveLength(LABEL_COLORS.length);
    await expect(canvasElement.querySelector('[data-color="red"]')).toHaveAttribute("data-ink", "light");
    await expect(canvasElement.querySelector('[data-color="teal"]')).toHaveAttribute("data-ink", "dark");
  },
};
