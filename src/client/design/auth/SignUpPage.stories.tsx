import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { SOCIAL_PROVIDERS } from "../../../shared/socialSignIn";
import { SignUpPage } from "./SignUpPage";

const meta = {
  title: "Auth/SignUpPage",
  component: SignUpPage,
  args: { onSignUp: fn(), onLogin: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The Create an account card: Name, Email and Password (PasswordField with a minimum length). Create account enables once all three are valid; onSignUp receives the trimmed values and the screen passes `busy` and `error` back. An invite prefills and locks the address it was sent to with defaultEmail + lockEmail." } },
  },
} satisfies Meta<typeof SignUpPage>;
export default meta;
type Story = StoryObj<typeof meta>;
// Rounded theme: the legal line's Terms / Privacy links are colour-only, no underline (axe link-in-text-block).
const legalLinksTodo = { a11y: { test: "todo" } } as const;

export const Empty: Story = {
  parameters: legalLinksTodo,
  async play({ args, canvas, userEvent }) {
    const submit = canvas.getByRole("button", { name: "Create account" });
    await userEvent.type(canvas.getByLabelText("Name"), "todoi");
    await userEvent.type(canvas.getByLabelText("Email"), "info@todoi.org");
    await userEvent.type(canvas.getByLabelText(/^Password/), "short");
    await expect(submit).toBeDisabled();
    await userEvent.type(canvas.getByLabelText(/^Password/), " but now long");
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await expect(args.onSignUp).toHaveBeenCalledWith({ name: "todoi", email: "info@todoi.org", password: "short but now long" });
    await userEvent.click(canvas.getByRole("button", { name: "Log in" }));
    await expect(args.onLogin).toHaveBeenCalledOnce();
  },
};
export const FromInvite: Story = {
  parameters: legalLinksTodo,
  args: { context: "Create an account to accept the invite.", defaultEmail: "sam@helicopters.eu", lockEmail: true },
  async play({ canvas }) {
    await expect(canvas.getByLabelText("Email")).toHaveAttribute("readonly");
    await expect(canvas.getByLabelText("Name")).toHaveFocus();
  },
};
export const ServerError: Story = {
  parameters: legalLinksTodo,
  args: { defaultName: "todoi", defaultEmail: "info@todoi.org", error: "An account with this email already exists." },
  async play({ canvas }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("already exists");
  },
};
export const Busy: Story = {
  parameters: legalLinksTodo,
  args: { defaultName: "todoi", defaultEmail: "info@todoi.org", busy: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Creating your account…" })).toBeDisabled();
  },
};

/** GitHub and Google under the form: switched off for now (shared/socialSignIn.ts), disabled with why. */
export const WithProvidersUnavailable: Story = {
  args: { providers: SOCIAL_PROVIDERS, onProvider: fn() },
  parameters: legalLinksTodo,
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Continue with GitHub" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Continue with Google" })).toHaveAccessibleDescription("Google login temporarily unavailable");
  },
};
