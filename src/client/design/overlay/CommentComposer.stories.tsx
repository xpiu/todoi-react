import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";

import { CommentComposer, type CommentComposerProps } from "./CommentComposer";

const MEMBERS = [
  { id: "u1", name: "Flo Zuallaert", color: "var(--label-blue)" },
  { id: "u2", name: "Sam Verhoeven", nickname: "sam", color: "var(--label-teal)" },
  { id: "u3", name: "Sara Peeters", color: "var(--label-pink)" },
];

// Story state models the overlay, which keeps the draft so it survives closing the item.
function ControlledComposer(args: CommentComposerProps) {
  const [value, setValue] = useState(args.value);
  return <CommentComposer {...args} value={value} onChange={(v) => { setValue(v); args.onChange(v); }} />;
}

const meta = {
  title: "Overlay/CommentComposer",
  component: CommentComposer,
  render: (args) => <ControlledComposer key={args.value} {...args} />,
  decorators: [(Story) => <div style={{ maxWidth: 520, paddingTop: 160 }}><Story /></div>],
  args: { value: "", onChange: fn(), onSubmit: fn(), onCancelReply: fn(), members: MEMBERS },
  parameters: { docs: { description: { component: "The activity thread's composer: MentionField (an auto-growing textarea with @mention completion) plus Send. ↵ sends the trimmed text, ⇧↵ breaks a line. The caller owns the draft and the send: it passes `pending` while a send is in flight and `error` when it fails, keeping the text so Send retries. `replyTo` shows a dismissible Replying to line." } } },
} satisfies Meta<typeof CommentComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  async play({ canvas }) {
    await expect(canvas.getByRole("textbox", { name: "Comment" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  },
};
export const MentionAndSend: Story = {
  async play({ args, canvas, userEvent }) {
    const field = canvas.getByRole("textbox", { name: "Comment" });
    await userEvent.type(field, "@sa");
    const people = canvas.getByRole("listbox", { name: "People" });
    await expect(people).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("option", { name: /Sara Peeters/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowUp}{Enter}");
    await expect(field).toHaveValue("@sam ");
    await expect(canvas.queryByRole("listbox", { name: "People" })).not.toBeInTheDocument();
    await userEvent.keyboard("can you check the dates?");
    await userEvent.keyboard("{Enter}");
    await expect(args.onSubmit).toHaveBeenCalledWith("@sam can you check the dates?");
  },
};
export const Reply: Story = {
  args: { value: "@sam ", replyTo: "Sam Verhoeven" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("textbox", { name: "Comment" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Stop replying" }));
    await expect(args.onCancelReply).toHaveBeenCalledOnce();
  },
};
export const Sending: Story = {
  args: { value: "Booked the hangar for Thursday.", pending: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Sending…" })).toBeDisabled();
  },
};
export const SendFailed: Story = {
  args: { value: "Booked the hangar for Thursday.", error: "Couldn't send: you're offline" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("you're offline");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onSubmit).toHaveBeenCalledWith("Booked the hangar for Thursday.");
  },
};
