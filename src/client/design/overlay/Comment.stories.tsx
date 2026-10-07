import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { Comment } from "./Comment";

const MEMBERS = [
  { id: "u1", name: "Flo Zuallaert", color: "var(--label-blue)" },
  { id: "u2", name: "Sam Verhoeven", nickname: "sam", color: "var(--label-teal)" },
];

const meta = {
  title: "Overlay/Comment",
  component: Comment,
  decorators: [(Story) => <div style={{ maxWidth: 520 }}><Story /></div>],
  args: {
    author: "Flo Zuallaert",
    color: "var(--label-blue)",
    meta: "2 hours ago",
    text: "@sam can you check the **delivery dates** against HE-120 before Friday?",
    members: MEMBERS,
    reactions: [{ emoji: "👍", count: 2, mine: true, by: ["Flo Zuallaert", "Sam Verhoeven"] }],
    mine: true,
    onReact: fn(),
    onEdit: fn(),
    onDelete: fn(),
    onReply: fn(),
    onOpenKey: fn(),
  },
  parameters: { docs: { description: { component: "One comment or activity row in the overlay's thread. Comments render Markdown with mentions and item keys, reaction chips plus a picker, Reply for anyone, and Edit / two-step Delete when `mine`. The thread owns the data: onEdit may return a promise and editing stays open until it resolves, showing the reason when it rejects. variant=\"activity\" is one sentence around the bold actor." } } },
} satisfies Meta<typeof Comment>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MyComment: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    const field = canvas.getByRole("textbox", { name: "Edit comment" });
    await expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, "Dates confirmed with the customer.");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect(args.onEdit).toHaveBeenCalledWith("Dates confirmed with the customer.");
    await waitFor(() => expect(canvas.queryByRole("textbox", { name: "Edit comment" })).not.toBeInTheDocument());
  },
};
export const EditFails: Story = {
  args: { onEdit: fn(() => Promise.reject(new Error("you're offline"))) },
  async play({ canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Edit comment" }), " Thanks!");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn't save: you're offline");
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeEnabled();
    await expect(canvas.getByRole("textbox", { name: "Edit comment" })).toHaveValue("@sam can you check the **delivery dates** against HE-120 before Friday? Thanks!");
  },
};
export const DeleteWithConfirm: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await expect(canvas.getByText("Delete this comment?")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await expect(args.onDelete).toHaveBeenCalledOnce();
  },
};
export const React: Story = {
  async play({ args, canvas, canvasElement, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: /^👍 2/ }));
    await expect(args.onReact).toHaveBeenCalledWith("👍");
    await userEvent.click(canvas.getByRole("button", { name: "Add reaction" }));
    const page = within(canvasElement.ownerDocument.body);
    const picker = await page.findByRole("dialog", { name: "Reactions" });
    await userEvent.click(within(picker).getByRole("button", { name: "React 🎉" }));
    await expect(args.onReact).toHaveBeenLastCalledWith("🎉");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Reactions" })).not.toBeInTheDocument());
  },
};
export const SomeoneElses: Story = {
  args: { author: "Sam Verhoeven", color: "var(--label-teal)", mine: false, edited: "Sep 14", text: "Booked the hangar for **Thursday**. See HE-116.", reactions: [] },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Reply" }));
    await expect(args.onReply).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("link", { name: "HE-116" }));
    await expect(args.onOpenKey).toHaveBeenCalledWith("HE-116");
  },
};
export const Activity: Story = {
  args: { variant: "activity", author: "Sam Verhoeven", meta: "yesterday", text: undefined, children: "moved this item from To do to Doing" },
};
