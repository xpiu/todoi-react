import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { EmptyState } from "./EmptyState";

const meta = {
  title: "Core/EmptyState",
  component: EmptyState,
  args: {
    icon: "list",
    title: "No lists in this project yet",
    hint: "Add a list to start collecting items, or begin with the usual three.",
    action: { label: "Add a list", icon: "plus", shortcut: "shift N", onClick: fn() },
    secondary: { label: "To-do · Doing · Done", onClick: fn() },
  },
  parameters: { docs: { description: { component: "The one block for every “nothing to show” situation: glyph, one title, at most one hint and up to two actions. Use surface=\"chrome\" on the app canvas and surface=\"card\" (often compact) inside a list or section; tone=\"danger\" with role=\"alert\" for failed loads. The caller supplies the action handlers." } } },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Canvas: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: /Add a list/ }));
    await expect(args.action?.onClick).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "To-do · Doing · Done" }));
    await expect(args.secondary?.onClick).toHaveBeenCalledOnce();
  },
};
export const InCard: Story = {
  decorators: [(Story) => <div style={{ maxWidth: 340, background: "var(--surface-card)" }}><Story /></div>],
  args: { surface: "card", compact: true, icon: "inbox", title: "Your inbox is empty", hint: "Items you capture here can be dragged onto a project later.", action: undefined, secondary: undefined },
};
export const LoadFailed: Story = {
  args: { tone: "danger", role: "alert", icon: "cloud-off", title: "We could not load this project", hint: "Please check the connection and try again.", action: { label: "Retry", icon: "refresh-cw", onClick: fn() }, secondary: { label: "Details", onClick: fn() }, footer: <>If the issue persists, please <a href="https://todoi.com/contact">contact</a> us.</> },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("We could not load this project");
    await expect(canvas.getByRole("link", { name: "contact" })).toHaveAttribute("href", "https://todoi.com/contact");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.action?.onClick).toHaveBeenCalledOnce();
  },
};
export const DisabledAction: Story = {
  args: { action: { label: "Add a list", icon: "plus", disabled: true, onClick: fn() }, secondary: undefined },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Add a list" })).toBeDisabled();
  },
};
export const TitleOnly: Story = { args: { icon: undefined, hint: undefined, action: undefined, secondary: undefined, title: "Nothing due this week" } };
