import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { MemberPicker, type MemberPickerProps, type PickableMember } from "./MemberPicker";

const MEMBERS: PickableMember[] = [
  { id: "u1", name: "Flo Zuallaert", nickname: "flo" },
  { id: "u2", name: "Sam Verhoeven", nickname: "sam" },
  { id: "u3", name: "Marit Olsen", email: "marit@example.com" },
  { id: "u4", name: "Jonas Berg", email: "jonas@example.com", color: "var(--label-teal)" },
];

function ControlledMemberPicker(args: MemberPickerProps) {
  const [value, setValue] = useState(args.value);
  return <MemberPicker {...args} value={value} onChange={(ids) => { setValue(ids); args.onChange(ids); }} />;
}

const meta = {
  title: "Core/MemberPicker",
  component: MemberPicker,
  render: (args) => <ControlledMemberPicker key={args.value.join()} {...args} />,
  args: { members: MEMBERS, value: [], onChange: fn() },
  parameters: { docs: { description: { component: "Multi-select people picker: the trigger shows an AvatarStack and first names (or the placeholder) over a dialog Popover with search and check rows; assigned people sort first. The caller owns `value` (member ids) and receives the next id list from onChange; `max` caps the selection." } } },
} satisfies Meta<typeof MemberPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Assign: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Assignees" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Assignees" });
    const search = within(panel).getByRole("textbox", { name: "Search people" });
    await waitFor(() => expect(search).toHaveFocus());
    await userEvent.type(search, "marit@{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith(["u3"]);
    await userEvent.clear(search);
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Sam Verhoeven" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["u3", "u2"]);
    await expect(within(panel).getByRole("checkbox", { name: "Sam Verhoeven" })).toBeChecked();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveTextContent("sam, Marit");
  },
};
export const KeyboardRows: Story = {
  args: { value: ["u2"] },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Assignees" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Assignees" });
    await waitFor(() => expect(within(panel).getByRole("textbox", { name: "Search people" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    // Assigned people sort first.
    await expect(within(panel).getByRole("checkbox", { name: "Sam Verhoeven" })).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect(args.onChange).toHaveBeenLastCalledWith([]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const ClearAll: Story = {
  args: { value: ["u1", "u2", "u3", "u4"] },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Assignees" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("button", { name: "Clear assignees" }));
    await expect(args.onChange).toHaveBeenLastCalledWith([]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const MaxOne: Story = {
  args: { value: ["u1"], max: 1, "aria-label": "Owner", placeholder: "Owner" },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Owner" }));
    const page = within(canvasElement.ownerDocument.body);
    const jonas = await page.findByRole("checkbox", { name: "Jonas Berg" });
    // At the cap the other rows are disabled, say why, and a pick leaves the selection unchanged.
    await expect(jonas).toHaveAttribute("aria-disabled", "true");
    await expect(jonas).toHaveAccessibleDescription("One person at most. Remove them to pick someone else.");
    await expect(page.getByRole("checkbox", { name: "Flo Zuallaert" })).not.toHaveAttribute("aria-disabled");
    await userEvent.click(jonas);
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const NoMembers: Story = { args: { members: [] } };
export const Disabled: Story = { args: { value: ["u1", "u2"], disabled: true } };
