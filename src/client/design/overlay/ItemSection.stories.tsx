import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { Button } from "../core/Button";
import { ItemSection } from "./ItemSection";

const meta = {
  title: "Overlay/ItemSection",
  component: ItemSection,
  decorators: [(Story) => <div style={{ maxWidth: 480 }}><Story /></div>],
  args: {
    icon: "paperclip",
    title: "Attachments",
    children: <p style={{ margin: 0 }}>quote-helicopters-europe.pdf · 248 KB</p>,
  },
  parameters: { docs: { description: { component: "A titled block in the item overlay's main column (Attachments, Relations): glyph, title, an optional trailing action, and the body inset under the title. Purely presentational; the overlay composes the section's content and owns its state." } } },
} satisfies Meta<typeof ItemSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
const onAdd = fn();
export const WithAction: Story = {
  args: { action: <Button onClick={onAdd}>Add</Button> },
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await expect(onAdd).toHaveBeenCalledOnce();
  },
};
export const NoIconFlush: Story = { args: { icon: undefined, inset: false, title: "Relations" } };
export const TitleOnly: Story = { args: { children: undefined, title: "Attachments (none yet)" } };
