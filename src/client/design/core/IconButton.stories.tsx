import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { IconButton } from "./IconButton";

const meta = {
  title: "Core/IconButton",
  component: IconButton,
  args: { name: "ellipsis", label: "More actions", tooltip: "More actions", onClick: fn() },
  parameters: { docs: { description: { component: "A square icon-only button. `label` is the required accessible name; `tooltip` is an optional 2–4 word CSS hint, never the only label. Ghost on light surfaces, chrome on the app frame and dark covers. Native button props and refs pass through, so it works as a Base UI trigger (MenuButton, Popover)." } } },
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = {
  async play({ args, canvas, userEvent }) {
    const button = canvas.getByRole("button", { name: "More actions" });
    await expect(button).toHaveAttribute("data-tip", "More actions");
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
    button.focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};
export const Chrome: Story = {
  decorators: [(Story) => <div style={{ background: "var(--chrome-topbar)", padding: 12, display: "inline-flex" }}><Story /></div>],
  args: { name: "panel-right", label: "Hide sidebar", tooltip: "Hide sidebar", variant: "chrome" },
};
export const Small: Story = { args: { name: "x", label: "Close", tooltip: undefined, size: 24, iconSize: 14 } };
export const Round: Story = { args: { name: "user", label: "Account", tooltip: "Account", round: true, size: 28 } };
export const TooltipOnTop: Story = { args: { name: "download", label: "Export", tooltip: "Export", tooltipSide: "top" } };
export const Disabled: Story = {
  args: { disabled: true, tooltip: undefined },
  async play({ args, canvas }) {
    const button = canvas.getByRole("button", { name: "More actions" });
    await expect(button).toBeDisabled();
    button.click();
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
