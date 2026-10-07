import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { SignInPage } from "./SignInPage";

const meta = {
  title: "Auth/SignInPage",
  component: SignInPage,
  args: { onSignIn: fn(), onForgotPassword: fn(), onCreateAccount: fn() },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "The Log in card: email and password, Log in stays disabled until both are valid. The screen owns the request: onSignIn receives the trimmed values, and the caller passes `busy` while it runs and `error` when it fails. `context` explains why the person landed here; onForgotPassword receives the typed email." } },
  },
} satisfies Meta<typeof SignInPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  async play({ args, canvas, userEvent }) {
    const submit = canvas.getByRole("button", { name: "Log in" });
    await expect(submit).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("Email"), "  flo@todoi.com ");
    await userEvent.type(canvas.getByLabelText(/^Password/), "correct horse");
    await expect(submit).toBeEnabled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSignIn).toHaveBeenCalledWith({ email: "flo@todoi.com", password: "correct horse" });
  },
};
export const ContinueWhereYouLeftOff: Story = {
  args: { context: "Log in to continue where you left off.", defaultEmail: "flo@todoi.com" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByLabelText(/^Password/)).toHaveFocus();
    await userEvent.click(canvas.getByRole("link", { name: "Forgot?" }));
    await expect(args.onForgotPassword).toHaveBeenCalledWith("flo@todoi.com");
    await userEvent.click(canvas.getByRole("link", { name: "Create an account" }));
    await expect(args.onCreateAccount).toHaveBeenCalledOnce();
  },
};
export const WrongPassword: Story = {
  args: { defaultEmail: "flo@todoi.com", error: "That email and password don't match." },
  async play({ canvas }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("don't match");
  },
};
export const Busy: Story = {
  args: { defaultEmail: "flo@todoi.com", busy: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Logging in…" })).toBeDisabled();
  },
};
export const WithoutSignUp: Story = { args: { onCreateAccount: undefined, onForgotPassword: undefined } };
