import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { SOCIAL_PROVIDERS } from "../../../shared/socialSignIn";
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
    await userEvent.type(canvas.getByLabelText("Email"), "  info@todoi.org ");
    const password = canvas.getByLabelText(/^Password/);
    await expect(password).toHaveAccessibleName("Password");
    await userEvent.type(password, "correct horse");
    await expect(submit).toBeEnabled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onSignIn).toHaveBeenCalledWith({ email: "info@todoi.org", password: "correct horse" });
  },
};
export const ContinueWhereYouLeftOff: Story = {
  args: { context: "Log in to continue where you left off.", defaultEmail: "info@todoi.org" },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByLabelText(/^Password/)).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: /^Forgot password\?$/ })).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect(args.onForgotPassword).toHaveBeenCalledWith("info@todoi.org");
    await expect(args.onSignIn).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Create an account" }));
    await expect(args.onCreateAccount).toHaveBeenCalledOnce();
  },
};
export const WrongPassword: Story = {
  args: { defaultEmail: "info@todoi.org", error: "That email and password don't match." },
  async play({ canvas }) {
    await expect(canvas.getByRole("alert")).toHaveTextContent("don't match");
  },
};
export const Busy: Story = {
  args: { defaultEmail: "info@todoi.org", busy: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Logging in…" })).toBeDisabled();
  },
};
export const WithoutSignUp: Story = { args: { onCreateAccount: undefined, onForgotPassword: undefined } };

/** Passkeys offered: the button under an "or" rule, and the email field takes the browser's passkey autofill. */
export const WithPasskey: Story = {
  args: { onPasskey: fn() },
  async play({ args, canvas, userEvent }) {
    await expect(canvas.getByLabelText("Email")).toHaveAttribute("autocomplete", "username webauthn");
    await expect(canvas.getByText("or")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Log in with a passkey" }));
    await expect(args.onPasskey).toHaveBeenCalledOnce();
    await expect(args.onSignIn).not.toHaveBeenCalled();
  },
};
export const WaitingForThePasskey: Story = {
  args: { onPasskey: fn(), passkeyBusy: true },
  async play({ canvas }) {
    await expect(canvas.getByRole("button", { name: "Waiting for your device…" })).toBeDisabled();
  },
};
export const PasskeyDidNotFinish: Story = { args: { onPasskey: fn(), error: "Your device didn't finish. Try again, or log in with your password." } };

/** GitHub and Google under the passkey: switched off for now (shared/socialSignIn.ts), so each button is
 *  disabled with a warning dot and "<Name> login temporarily unavailable" as its description. */
export const WithProvidersUnavailable: Story = {
  args: { onPasskey: fn(), providers: SOCIAL_PROVIDERS, onProvider: fn() },
  async play({ canvas }) {
    for (const name of ["GitHub", "Google"]) {
      const button = canvas.getByRole("button", { name: `Continue with ${name}` });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAccessibleDescription(`${name} login temporarily unavailable`);
    }
    await expect(canvas.getByRole("button", { name: "Log in with a passkey" })).toBeEnabled();
  },
};
/** Once a provider is switched on, its button continues with it. */
export const WithProvidersAvailable: Story = {
  args: { providers: SOCIAL_PROVIDERS.map((p) => ({ ...p, available: true })), onProvider: fn() },
  async play({ args, canvas, userEvent }) {
    await userEvent.click(canvas.getByRole("button", { name: "Continue with GitHub" }));
    await expect(args.onProvider).toHaveBeenCalledWith("github");
    await expect(canvas.queryByText(/temporarily unavailable/)).toBeNull();
  },
};
