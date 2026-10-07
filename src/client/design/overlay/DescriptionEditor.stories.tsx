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
  parameters: { docs: { description: { component: "The item description: Markdown in, Markdown out. The view renders the shared Markdown (click it, or Tab to its Edit button, to edit; links and item keys inside stay links); editing is a Tiptap editor limited to the design-system subset with a quiet toolbar, Save and Cancel (ctrl+↵ / Esc). The overlay owns the value: onChange may return a promise and the editor keeps the draft until it resolves; onDraft mirrors the unsaved draft and initialDraft resumes it." } } },
} satisfies Meta<typeof DescriptionEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByRole("button", { name: "Add a more detailed description…" })).toBeInTheDocument();
    await userEvent.click(canvas.getByText("Add a more detailed description…"));
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
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Edit description" })).toHaveFocus();
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
/** Valid Markdown in another spelling than the serializer's: opening it is not an edit. */
export const OpensUnedited: Story = {
  args: { value: "## Scope\nQuote the H145.\n* Delivery in March", autoFocus: true },
  async play({ args, canvas, userEvent }) {
    await waitFor(() => expect(canvas.getByLabelText("Description")).toHaveFocus());
    await expect(canvas.queryByText("Unsaved")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(args.onDraft).not.toHaveBeenCalledWith(expect.any(String));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument());
  },
};
export const MentionsAndKeys: Story = {
  args: { value: "Waiting on HE-120. @sam has the export paperwork.", members: [{ name: "Sam Verhoeven", nickname: "sam" }], onOpenKey: fn() },
  async play({ args, canvas, userEvent }) {
    // The key is its own link: clicking or Enter opens it and leaves the view as it is.
    const key = canvas.getByRole("link", { name: "HE-120" });
    await userEvent.click(key);
    await expect(args.onOpenKey).toHaveBeenCalledWith("HE-120");
    await expect(key).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onOpenKey).toHaveBeenCalledTimes(2);
    await expect(canvas.queryByRole("toolbar")).not.toBeInTheDocument();
    // The next stop edits.
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Edit description" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(canvas.getByLabelText("Description")).toHaveFocus());
  },
};
