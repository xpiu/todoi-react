import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";

import type { IconName } from "./Icon";
import { IconPicker, type IconPickerProps } from "./IconPicker";

function ControlledIconPicker(args: IconPickerProps) {
  const [value, setValue] = useState<IconName | null>(args.value ?? null);
  return <IconPicker {...args} value={value} onChange={(icon) => { setValue(icon); args.onChange?.(icon); }} />;
}

const meta = {
  title: "Core/IconPicker",
  component: IconPicker,
  render: (args) => <ControlledIconPicker key={String(args.value)} {...args} />,
  // The picker is panel content; the app mounts it inside a Popover or the list-actions menu.
  decorators: [(Story) => <div className="td-pop" style={{ width: 260, position: "static" }}><Story /></div>],
  args: { value: null, autoIcon: "circle-dot", onChange: fn() },
  parameters: { docs: { description: { component: "The list-icon chooser: a basic status set, a “…” tile that expands into the searchable grouped catalogue, and an Automatic row that drops the override. Panel content only: mount it in a Popover or a menu sub-view. The caller owns the override (`value`, null = automatic) and receives onChange(icon | null); arrow keys rove the tiles and typing starts a search." } } },
} satisfies Meta<typeof IconPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PickBasic: Story = {
  async play({ args, canvas, userEvent }) {
    // A toggle like the tiles, so the picker works in a Popover dialog as well as a menu sub-view.
    await expect(canvas.getByRole("button", { name: /Automatic/ })).toHaveAttribute("aria-pressed", "true");
    // Every basic tile draws its own glyph (none falls back to the plain circle).
    for (const [name, glyph] of [["In review", "circle-ellipsis"], ["On hold", "circle-pause"], ["Cancelled", "circle-x"]]) {
      await expect(canvas.getByRole("button", { name }).querySelector(`svg.lucide-${glyph}`)).not.toBeNull();
    }
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(args.onChange).toHaveBeenLastCalledWith("circle-check");
    await expect(canvas.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: /Automatic/ })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(canvas.getByRole("button", { name: /Automatic/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith(null);
  },
};
export const KeyboardAndSearch: Story = {
  async play({ args, canvas, userEvent }) {
    canvas.getByRole("button", { name: "None" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("button", { name: "New" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(canvas.getByRole("button", { name: "More icons" })).toHaveFocus();
    // Typing on a tile opens the catalogue with the search filled in.
    await userEvent.keyboard("r");
    const search = await canvas.findByRole("textbox", { name: "Search icons" });
    await waitFor(() => expect(search).toHaveFocus());
    await userEvent.keyboard("ocket");
    await expect(search).toHaveValue("rocket");
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("button", { name: "Rocket" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith("rocket");
  },
};
export const Expanded: Story = { args: { expanded: true, value: "rocket" } };
export const NoMatches: Story = {
  args: { expanded: true },
  async play({ canvas, userEvent }) {
    await userEvent.type(canvas.getByRole("textbox", { name: "Search icons" }), "zzz");
    await expect(canvas.getByText("No icons match “zzz”")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByRole("textbox", { name: "Search icons" })).toHaveValue("");
  },
};
export const OverrideSet: Story = { args: { value: "archive", autoIcon: "circle-todo", autoLabel: "To-do" } };
