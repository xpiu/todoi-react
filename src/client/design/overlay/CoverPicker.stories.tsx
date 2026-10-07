import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { CoverPicker, type CoverPickerProps, type CoverValue } from "./CoverPicker";

const svg = (fill: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="${fill}"/></svg>`);
const IMAGES = [
  { id: "a1", name: "hangar.png", src: svg("steelblue") },
  { id: "a2", name: "rotor-detail.png", src: svg("firebrick") },
];

// Story state models the item that owns the cover.
function ControlledCoverPicker(args: CoverPickerProps) {
  const [cover, setCover] = useState<CoverValue | null>(args.cover);
  return <CoverPicker {...args} cover={cover} onChange={(c) => { setCover(c); args.onChange(c); }} />;
}

const meta = {
  title: "Overlay/CoverPicker",
  component: CoverPicker,
  render: (args) => <ControlledCoverPicker key={JSON.stringify(args.cover)} {...args} />,
  decorators: [(Story) => <div style={{ width: 200 }}><Story /></div>],
  args: { cover: null, images: IMAGES, onChange: fn(), onUpload: fn(), block: true },
  parameters: { docs: { description: { component: "The item's cover in the overlay aside: label colours plus two neutrals, the item's image attachments as tiles, Upload and Remove cover. Controlled: the caller stores the {color} or {src, attachmentId} value from onChange (null removes it); onUpload hands a picked file to the attachment flow." } } },
} satisfies Meta<typeof CoverPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoCover: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Cover" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Cover" });
    await userEvent.click(within(panel).getByRole("radio", { name: "blue" }));
    await expect(args.onChange).toHaveBeenCalledWith({ color: "var(--label-blue)" });
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Cover" })).not.toBeInTheDocument());
    await expect(trigger).toHaveTextContent("Blue cover");
  },
};
export const ColorCover: Story = {
  args: { cover: { color: "var(--label-teal)" } },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Cover" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Cover" });
    await expect(within(panel).getByRole("radio", { name: "teal" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(panel).getByRole("button", { name: "Remove cover" }));
    await expect(args.onChange).toHaveBeenCalledWith(null);
  },
};
export const ImageCover: Story = {
  args: { cover: { src: IMAGES[0]!.src, attachmentId: "a1" } },
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Cover" }));
    const page = within(canvasElement.ownerDocument.body);
    const panel = await page.findByRole("dialog", { name: "Cover" });
    await expect(within(panel).getByRole("button", { name: "hangar.png" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(panel).getByRole("button", { name: "rotor-detail.png" }));
    await expect(args.onChange).toHaveBeenCalledWith({ src: IMAGES[1]!.src, attachmentId: "a2" });
  },
};
export const ColorsOnly: Story = { args: { images: [], onUpload: undefined } };
export const Disabled: Story = {
  args: { disabled: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Cover" })).toBeDisabled();
  },
};
