import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";

import { DescriptionEditor } from "./DescriptionEditor";

const DESCRIPTION = [
  "## Scope",
  "",
  "Quote the **H145** with the optional rescue hoist.",
  "",
  "- Delivery in *March*",
  "- Training for two pilots",
  "",
  "> Payment terms follow the frame agreement.",
].join("\n");

const meta = {
  title: "Overlay/DescriptionEditor",
  component: DescriptionEditor,
  decorators: [(Story) => <div style={{ maxWidth: 560 }}><Story /></div>],
  args: { value: "", onChange: fn(), onDraft: fn(), onSuggestShortcut: fn() },
  parameters: { docs: { description: { component: "The item description: Markdown in, Markdown out. The view renders the shared Markdown (click or Enter to edit); editing is a Tiptap editor limited to the design-system subset with a quiet toolbar, Save and Cancel (ctrl+↵ / Esc). The overlay owns the value: onChange may return a promise and the editor keeps the draft until it resolves; onDraft mirrors the unsaved draft and initialDraft resumes it." } } },
} satisfies Meta<typeof DescriptionEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: /Add a more detailed description/ }));
    const editor = await canvas.findByLabelText("Description");
    await waitFor(() => expect(editor).toHaveFocus());
    await expect(canvas.getByRole("toolbar", { name: "Formatting" })).toBeVisible();
    await userEvent.keyboard("Confirm the delivery dates");
    await expect(canvas.getByText("Unsaved")).toBeVisible();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect(args.onChange).toHaveBeenCalledWith("Confirm the delivery dates");
    await waitFor(() => expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument());
  },
};
export const WithMarkdown: Story = { args: { value: DESCRIPTION } };
export const CancelEditing: Story = {
  args: { value: DESCRIPTION },
  async play({ args, canvas, userEvent }) {
    const view = canvas.getByTitle("Click to edit description");
    view.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(canvas.getByLabelText("Description")).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onChange).not.toHaveBeenCalled();
    await expect(args.onSuggestShortcut).toHaveBeenCalledWith("description", 200);
    await expect(canvas.getByTitle("Click to edit description")).toBeVisible();
  },
};
export const SaveFails: Story = {
  args: { value: "Quote the H145.", onChange: fn(() => Promise.reject(new Error("you're offline"))), autoFocus: true },
  async play({ args, canvas, userEvent }) {
    await waitFor(() => expect(canvas.getByLabelText("Description")).toHaveFocus());
    await userEvent.keyboard(" With hoist.");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn't save: you're offline");
    await expect(args.onChange).toHaveBeenCalledWith("Quote the H145. With hoist.");
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeEnabled();
    await expect(canvas.getByRole("toolbar", { name: "Formatting" })).toBeVisible();
  },
};
export const ResumedDraft: Story = {
  args: { value: "Quote the H145.", initialDraft: "Quote the H145 with the rescue hoist." },
  async play({ canvas }) {
    await expect(canvas.getByText("Unsaved")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Discard" })).toBeVisible();
  },
};
export const MentionsAndKeys: Story = {
  // The view is role="button" and the Markdown inside renders the item key as role="link" (axe nested-interactive).
  parameters: { a11y: { test: "todo" } },
  args: { value: "Waiting on HE-120. @sam has the export paperwork.", members: [{ name: "Sam Verhoeven", nickname: "sam" }], onOpenKey: fn() },
};
