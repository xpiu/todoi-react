import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { CalendarSubscribeDialog } from "./CalendarSubscribeDialog";

const URL_A = "https://todoi.com/api/feeds/calendar/q8Xv0bH2kLm4nP6rS9tUwYzA1cE3gJ5iK7oM0pR2sT4vW6xZ8aC0dF2hJ4kL6mN.ics";
const URL_B = "https://todoi.com/api/feeds/calendar/Zr4tY6uI8oP0aS2dF4gH6jK8lQ1wE3rT5yU7iO9pA1sD3fG5hJ7kL9zX1cV3bN.ics";

const meta = {
  title: "Calendar/CalendarSubscribeDialog",
  component: CalendarSubscribeDialog,
  args: { open: true, projectName: "Helicopters Europe website", url: URL_A, onClose: fn(), onReset: fn(), onDownload: fn(), onRetry: fn() },
  parameters: { layout: "fullscreen", docs: { description: { component: "\"Subscribe to calendar\", from the Calendar header's rss button: the person's private feed link with Copy (\"Copied\" only after the write; a refused copy selects the link and says so), a three-step how-to per calendar app, Reset link confirmed in place on its row, and \"Download a copy\" — the one-time .ics — as the secondary row. Done takes focus on open; Esc, × and the backdrop close it. CalendarSubscribePanel is the body alone." } } },
} satisfies Meta<typeof CalendarSubscribeDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialog = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

export const Default: Story = {
  async play({ args, canvasElement, userEvent }) {
    const page = dialog(canvasElement);
    const box = await page.findByRole("dialog", { name: "Subscribe to calendar" });
    await waitFor(() => expect(within(box).getByRole("button", { name: "Done" })).toHaveFocus());
    await expect(within(box).getByRole("textbox", { name: "Private link" })).toHaveValue(URL_A);
    await expect(within(box).getByRole("list", { name: "Steps for Google Calendar" })).toBeVisible();
    await userEvent.click(within(box).getByRole("button", { name: "Apple" }));
    await expect(within(box).getByRole("list", { name: "Steps for Apple Calendar" })).toBeVisible();
    await userEvent.click(within(box).getByRole("button", { name: "Download .ics" }));
    await expect(args.onDownload).toHaveBeenCalled();
    await userEvent.click(within(box).getByRole("button", { name: "Done" }));
    await expect(args.onClose).toHaveBeenCalledWith("close");
  },
};
/** Reset is two steps on its own row: the confirm, then the host swaps the link */
export const ResetConfirm: Story = {
  async play({ args, canvasElement, userEvent }) {
    const box = await dialog(canvasElement).findByRole("dialog", { name: "Subscribe to calendar" });
    await userEvent.click(within(box).getByRole("button", { name: "Reset link" }));
    await expect(within(box).getByText("Reset the link?")).toBeVisible();
    await userEvent.click(within(box).getByRole("button", { name: "Cancel" }));
    await expect(within(box).queryByText("Reset the link?")).not.toBeInTheDocument();
    await userEvent.click(within(box).getByRole("button", { name: "Reset link" }));
    await userEvent.click(within(box).getByRole("button", { name: "Reset link" }));
    await expect(args.onReset).toHaveBeenCalled();
  },
};
export const Resetting: Story = { args: { defaultResetConfirm: true, resetState: "busy" } };
export const ResetFailed: Story = {
  args: { defaultResetConfirm: true, resetError: "The server didn't answer." },
  async play({ canvasElement }) {
    const box = await dialog(canvasElement).findByRole("dialog", { name: "Subscribe to calendar" });
    await expect(within(box).getByRole("alert")).toHaveTextContent("Couldn't reset the link: The server didn't answer.");
    await expect(within(box).getByRole("button", { name: "Retry" })).toBeVisible();
  },
};
export const JustReset: Story = {
  args: { url: URL_B, justReset: true },
  async play({ canvasElement }) {
    const box = await dialog(canvasElement).findByRole("dialog", { name: "Subscribe to calendar" });
    await expect(within(box).getByRole("status")).toHaveTextContent("New link created. Subscribe again in your calendar app.");
  },
};
/** A host that resets for real: busy, then the new link and the note */
export const ResetFlow: Story = {
  render: function Render(args) {
    const [state, setState] = useState<{ url: string; busy: boolean; just: boolean }>({ url: URL_A, busy: false, just: false });
    const reset = () => {
      setState((s) => ({ ...s, busy: true }));
      setTimeout(() => setState({ url: URL_B, busy: false, just: true }), 300);
    };
    return <CalendarSubscribeDialog {...args} url={state.url} onReset={reset} resetState={state.busy ? "busy" : "idle"} justReset={state.just} />;
  },
  async play({ canvasElement, userEvent }) {
    const box = await dialog(canvasElement).findByRole("dialog", { name: "Subscribe to calendar" });
    await userEvent.click(within(box).getByRole("button", { name: "Reset link" }));
    await userEvent.click(within(box).getByRole("button", { name: "Reset link" }));
    await expect(within(box).getByRole("button", { name: "Resetting…" })).toBeDisabled();
    await waitFor(() => expect(within(box).getByRole("textbox", { name: "Private link" })).toHaveValue(URL_B));
    await expect(within(box).getByRole("status")).toHaveTextContent("New link created.");
    await expect(within(box).queryByText("Reset the link?")).not.toBeInTheDocument();
  },
};
export const Loading: Story = {
  args: { url: undefined, state: "loading" },
  async play({ canvasElement }) {
    const box = await dialog(canvasElement).findByRole("dialog", { name: "Subscribe to calendar" });
    await expect(within(box).getByRole("button", { name: "Copy" })).toBeDisabled();
    await expect(within(box).getByRole("button", { name: "Reset link" })).toBeDisabled();
  },
};
export const Failed: Story = {
  args: { url: undefined, state: "error", error: "Couldn't create the link: The server didn't answer." },
  async play({ args, canvasElement, userEvent }) {
    const box = await dialog(canvasElement).findByRole("dialog", { name: "Subscribe to calendar" });
    await userEvent.click(within(box).getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalled();
  },
};
/** Offline with the link already on screen: Copy still works, Reset and Download say why they wait */
export const Offline: Story = {
  args: { offline: true },
  async play({ canvasElement }) {
    const box = await dialog(canvasElement).findByRole("dialog", { name: "Subscribe to calendar" });
    await expect(within(box).getByRole("button", { name: "Copy" })).toBeEnabled();
    await expect(within(box).getByRole("button", { name: "Reset link" })).toBeDisabled();
    await expect(within(box).getByRole("button", { name: "Download .ics" })).toBeDisabled();
    await expect(within(box).getByText("You're offline. Reset the link when you reconnect.")).toBeVisible();
  },
};
/** Offline before the link ever loaded */
export const OfflineNoLink: Story = { args: { offline: true, url: undefined } };
export const Downloading: Story = { args: { downloadState: "busy" } };
export const DownloadFailed: Story = { args: { downloadError: "Export unavailable" } };
export const Phone: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
