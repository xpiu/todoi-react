import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { TextField } from "./TextField";

const meta = {
  title: "Core/TextField",
  component: TextField,
  args: { "aria-label": "Project name", placeholder: "Name your project" },
  parameters: { docs: { description: { component: "A native input or textarea with design tokens. Supply an accessible name through a label or aria-label; use application form state for controlled editing." } } },
} satisfies Meta<typeof TextField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Editing: Story = {
  async play({ canvas, userEvent }) {
    const field = canvas.getByRole("textbox", { name: "Project name" });
    await userEvent.type(field, "Helicopters Europe");
    await expect(field).toHaveValue("Helicopters Europe");
  },
};
export const Search: Story = { args: { "aria-label": "Search items", icon: "search", placeholder: "Search" } };
export const Multiline: Story = { args: { multiline: true, "aria-label": "Description", placeholder: "Describe the project" } };
export const Invalid: Story = { args: { "aria-invalid": true, defaultValue: "", placeholder: "A name is required" } };
export const Disabled: Story = { args: { disabled: true, defaultValue: "Archived project" } };
