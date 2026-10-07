import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { AttachmentList, DropOverlay, type AttachmentFile } from "./Attachments";

const svg = (fill: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${fill}"/></svg>`);
const FILES: AttachmentFile[] = [
  { id: "f1", name: "hangar.png", mime: "image/png", src: svg("steelblue"), size: 482_000, meta: "Added Sep 12", isCover: true },
  { id: "f2", name: "quote-helicopters-europe.pdf", mime: "application/pdf", size: 248_000, meta: "Added Sep 14" },
  { id: "f3", name: "rotor-detail.png", mime: "image/png", src: svg("firebrick"), size: 1_310_000, meta: "Added Sep 15" },
  { id: "f4", name: "fleet-costs.xlsx", size: 32_400, meta: "Added Sep 20" },
];

const meta = {
  title: "Overlay/Attachments",
  component: AttachmentList,
  decorators: [(Story) => <div style={{ maxWidth: 520 }}><Story /></div>],
  args: {
    files: FILES,
    onAdd: fn(),
    onOpen: fn(),
    onDownload: fn(),
    onMakeCover: fn(),
    onRemoveCover: fn(),
    onRename: fn(),
    onDelete: fn(),
    onRetry: fn(),
    onDismiss: fn(),
  },
  parameters: { docs: { description: { component: "The item's files: thumbnail, name, meta and a hover Open + ⋯ menu (Download · Make / Remove cover · Rename · Delete with an inline confirm). The overlay owns the files and every action is an id callback; uploads in flight show progress with Cancel, failed ones their reason with Retry and Remove. Images open the Lightbox; DropOverlay, useFileDrop and useFileDropTargets add file drops to a panel or to cards." } } },
} satisfies Meta<typeof AttachmentList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Files: Story = {};
export const RenameAndDelete: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Actions for quote-helicopters-europe.pdf" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Rename" }));
    const field = await canvas.findByRole("textbox", { name: "File name" });
    await userEvent.clear(field);
    await userEvent.type(field, "signed-quote.pdf{Enter}");
    await expect(args.onRename).toHaveBeenCalledWith("f2", "signed-quote.pdf");

    await userEvent.click(canvas.getByRole("button", { name: "Actions for fleet-costs.xlsx" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Delete" }));
    await expect(await canvas.findByText("Delete this file?")).toBeVisible();
    await expect(args.onDelete).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await expect(args.onDelete).toHaveBeenCalledWith("f4");
  },
};
export const MakeCover: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for rotor-detail.png" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("menuitem", { name: "Make cover" }));
    await expect(args.onMakeCover).toHaveBeenCalledWith("f3");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
export const Lightbox: Story = {
  async play({ canvas, canvasElement, userEvent }) {
    const thumb = canvas.getByRole("button", { name: "Preview hangar.png" });
    await userEvent.click(thumb);
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("dialog", { name: "hangar.png" })).toBeVisible();
    await expect(page.getByText("1 / 2")).toBeVisible();
    await userEvent.keyboard("{ArrowRight}");
    await expect(await page.findByRole("dialog", { name: "rotor-detail.png" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const Uploading: Story = {
  args: { files: [{ id: "u1", name: "delivery-checklist.pdf", mime: "application/pdf", size: 2_400_000, progress: 42 }, FILES[1]!] },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("progressbar", { name: "Uploading delivery-checklist.pdf" })).toHaveAttribute("aria-valuenow", "42");
    await userEvent.click(canvas.getByRole("button", { name: "Cancel uploading delivery-checklist.pdf" }));
    await expect(args.onDismiss).toHaveBeenCalledWith("u1");
  },
};
export const FailedUpload: Story = {
  args: { files: [{ id: "u2", name: "flight-manual.pdf", size: 64_000_000, error: "The file is larger than 50 MB", retriable: false }, { id: "u3", name: "rotor-video.mp4", size: 8_000_000, error: "The connection dropped", retriable: true }] },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getAllByRole("alert")).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledWith("u3");
    await userEvent.click(canvas.getByRole("button", { name: "Remove flight-manual.pdf" }));
    await expect(args.onDismiss).toHaveBeenCalledWith("u2");
  },
};
export const DropTarget: Story = {
  render: (args) => <div style={{ position: "relative", minHeight: 220 }}><AttachmentList {...args} /><DropOverlay active hint="Images can become the cover" /></div>,
};
