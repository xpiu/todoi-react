// Passkeys in the browser: whether it can make and use them, and the reason a ceremony gave, as the
// screens say it. The ceremonies themselves are Better Auth's passkey client (authClient.passkey / signIn.passkey).

/** The browser has WebAuthn. */
export const passkeysSupported = () => typeof window.PublicKeyCredential === "function";

/** The browser can offer passkeys in the email field's autofill (WebAuthn conditional mediation). */
export async function passkeyAutofillAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  return (await PublicKeyCredential.isConditionalMediationAvailable?.().catch(() => false)) ?? false;
}

/** The person closed the prompt or the device gave up (SimpleWebAuthn's codes, or the plugin's own). */
const CANCELLED = ["ERROR_CEREMONY_ABORTED", "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", "AUTH_CANCELLED", "REGISTRATION_CANCELLED"];

/** Why a passkey ceremony ended without a result: adding one, logging in, or confirming it's you. */
export function passkeyFailure(error: { code?: string; message?: string } | null | undefined, ceremony: "add" | "login" | "confirm"): string {
  const code = error?.code ?? "";
  if (CANCELLED.includes(code)) return ceremony === "add" ? "Your device didn't finish. Nothing was added." : ceremony === "login" ? "Your device didn't finish. Try again, or log in with your password." : "Your device didn't finish. Try again, or use your password.";
  if (ceremony === "add" && (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || code === "PREVIOUSLY_REGISTERED")) return "This device already holds a passkey for your account.";
  if (code === "PASSKEY_NOT_FOUND") return ceremony === "login" ? "That passkey isn't for an account here. Log in with your password." : "That passkey isn't one of this account's.";
  return (error?.message || "Something went wrong.").replace(/\.$/, "");
}
