import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../core/Button";
import { IconButton } from "../core/IconButton";
import { Modal, type ModalProps } from "./Modal";

// Story state models the caller (ItemOverlay) that owns open.
function ItemModal(args: ModalProps) {
  const [open, setOpen] = useState(args.open);
  const close = () => {
    setOpen(false);
    args.onClose();
  };
  return <>
    <Button onClick={() => setOpen(true)}>Open item</Button>
    <Modal {...args} open={open} onClose={close} corner={args.corner ?? <IconButton name="x" label="Close" onClick={close} />} />
  </>;
}

const meta = {
  title: "Overlay/Modal",
  component: Modal,
  render: (args) => <ItemModal key={String(args.open)} {...args} />,
  args: {
    open: true,
    onClose: fn(),
    "aria-label": "Prepare the helicopter quote",
    title: <h2 className="td-modal-title">Prepare the helicopter quote</h2>,
    aside: <div className="td-aside-stack"><Button variant="outline" icon="paperclip" className="td-aside-btn">Attachment</Button><Button variant="outline" icon="eye" className="td-aside-btn">Watch</Button></div>,
    children: <p>Confirm delivery dates, optional equipment and payment terms with the customer before Friday.</p>,
  },
  parameters: { docs: { description: { component: "The item overlay shell on Base UI Dialog: optional cover strip, corner controls, title row, main column and aside. The caller owns `open` and closes on onClose (Escape, backdrop). Popovers opened inside portal into the popup; on phones (or with `sheet`) it fills the viewport and stacks the aside above the content. ItemOverlay is the assembled consumer." } } },
} satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const ColorCover: Story = { args: { cover: { color: "var(--label-blue)" } } };
export const ImageCover: Story = {
  args: { cover: { src: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="880" height="128"><rect width="880" height="128" fill="steelblue"/><circle cx="700" cy="40" r="28" fill="gold"/></svg>') } },
};
export const Sheet: Story = { args: { sheet: true } };
export const CloseFromCorner: Story = {
  args: { open: false },
  async play({ args, canvas, canvasElement, userEvent }) {
    const trigger = canvas.getByRole("button", { name: "Open item" });
    await userEvent.click(trigger);
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
