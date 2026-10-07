import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Button } from "../core/Button";
import { AuthShell, AuthState } from "./AuthShell";

const meta = {
  title: "Auth/AuthShell",
  component: AuthShell,
  args: {
    children: <>
      <h1 className="td-auth-title">Log in</h1>
      <p className="td-auth-sub">Log in to continue where you left off.</p>
    </>,
  },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The canvas behind every signed-out page: wordmark, one centred card and a quiet footer. Pages compose their own heading, form and links inside it; AuthState renders a closed or confirmation state (glyph, title, one sentence). Pass footer={null} to drop the Privacy · Terms line." } },
  },
} satisfies Meta<typeof AuthShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ canvas }) {
    await expect(canvas.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
    // The wordmark is plain text: no aria-label on a role-less element.
    await expect(canvas.getByText("Todoi")).not.toHaveAttribute("aria-label");
    await expect(canvas.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "https://todoi.app/privacy");
  },
};
export const SuccessState: Story = {
  args: {
    children: <>
      <AuthState icon="circle-check" tone="success" title="Password updated">You're logged in on this device and logged out everywhere else.</AuthState>
      <div className="td-auth-stack"><Button variant="primary" size="lg">Continue to Todoi</Button></div>
    </>,
  },
};
export const DangerState: Story = {
  args: { children: <AuthState icon="clock" tone="danger" title="This reset link has expired">Links work once and stop working after 1 hour.</AuthState> },
};
export const CustomFooter: Story = { args: { footer: <span>Signed out after 30 days of inactivity</span>, width: 480 } };
export const NoFooter: Story = {
  args: { footer: null },
  async play({ canvas }) {
    await expect(canvas.queryByRole("link", { name: "Privacy" })).not.toBeInTheDocument();
  },
};
