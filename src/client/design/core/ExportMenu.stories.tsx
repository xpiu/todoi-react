import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { ExportButton, ExportMenu } from "./ExportMenu";
import { MenuButton } from "./Menu";

const meta = {
  title: "Core/ExportMenu",
  component: ExportMenu,
  // ExportMenu is menu rows only; ExportButton is its stand-alone download trigger.
  render: (args) => <ExportButton {...args} />,
  args: { scope: "view", view: "Board", count: 7, filtered: true, onExport: fn(), onPrint: fn(), printShortcut: "ctrl P" },
  parameters: { docs: { description: { component: "Export rows (PDF · Markdown · CSV) with one summary note and an optional Print row. They are MenuItems, so mount them inside an existing Menu (a ⋯ drill view, the Share menu) or use ExportButton for a stand-alone download trigger. The caller performs the export in onExport(format)." } } },
} satisfies Meta<typeof ExportMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ExportView: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Export" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    // Base UI names the menu after its trigger.
    const menu = await page.findByRole("menu", { name: "Export" });
    await expect(menu).toHaveTextContent("This board view · 7 items · filters applied");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /CSV/ }));
    await expect(args.onExport).toHaveBeenCalledWith("csv");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const KeyboardPrint: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    canvas.getByRole("button", { name: "Export" }).focus();
    await userEvent.keyboard("{Enter}");
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole("menu", { name: "Export" });
    await waitFor(() => expect(menu).toContainElement(canvasElement.ownerDocument.activeElement as HTMLElement));
    await userEvent.keyboard("{End}");
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: /Print/ })).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await expect(args.onPrint).toHaveBeenCalledOnce();
    await expect(args.onExport).not.toHaveBeenCalled();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const ExportItem: Story = { args: { scope: "item", subitems: 3, comments: true, onPrint: undefined, printShortcut: undefined } };
export const DrillView: Story = {
  // Inside the item's ⋯ menu the rows follow a Back header.
  render: (args) => (
    <MenuButton label="Item options" width={232}>
      <ExportMenu {...args} />
    </MenuButton>
  ),
  args: { scope: "item", subitems: 2, onBack: fn() },
  // The Back header is a plain button inside role="menu" (aria-required-children).
  parameters: { a11y: { test: "todo" } },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Item options" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("button", { name: "Back" }));
    await expect(args.onBack).toHaveBeenCalledOnce();
  },
};
