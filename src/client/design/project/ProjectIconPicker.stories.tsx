import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import type { LabelColor } from "../../../shared/enums";
import type { IconName } from "../core/Icon";
import { ProjectIconPicker, type ProjectIconPickerProps } from "./ProjectIconPicker";

// Story state models the caller, which owns the project's icon and colour.
function ControlledPicker(args: ProjectIconPickerProps) {
  const [value, setValue] = useState<{ icon: IconName | null | undefined; color: LabelColor | null | undefined }>({ icon: args.icon, color: args.color });
  return (
    <ProjectIconPicker
      {...args}
      icon={value.icon}
      color={value.color}
      onChange={(v) => {
        setValue(v);
        args.onChange(v);
      }}
    />
  );
}

const meta = {
  title: "Project/ProjectIconPicker",
  component: ProjectIconPicker,
  render: (args) => <ControlledPicker {...args} />,
  args: { icon: "rocket", color: "orange", onChange: fn() },
  parameters: { docs: { description: { component: "The project glyph and colour in one Popover: a radio row of the eight label colours above a radio grid of project glyphs. The caller owns the value through onChange; picking a colour keeps the popover open, picking a glyph closes it and returns focus to the tile. Use `caption` for the labelled trigger in forms." } } },
} satisfies Meta<typeof ProjectIconPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tile: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Change icon and color" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog", { name: "Change icon and color" }));
    await expect(dialog.getByRole("radio", { name: "orange" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(dialog.getByRole("radio", { name: "teal" }));
    await expect(args.onChange).toHaveBeenCalledWith({ icon: "rocket", color: "teal" });
    await expect(dialog.getByRole("radio", { name: "teal" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(dialog.getByRole("radio", { name: "lightbulb" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ icon: "lightbulb", color: "teal" });
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const Captioned: Story = { args: { caption: "Change", placement: "bottom-end" } };
export const Large: Story = { args: { size: 48, iconSize: 24 } };
export const NoValue: Story = { args: { icon: null, color: null } };
export const Disabled: Story = {
  args: { disabled: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Change icon and color" })).toBeDisabled();
  },
};
