// Sudo mode in the browser (src/shared/sudo.ts): before a sensitive account action, `confirm(action)` asks
// the server whether this session is still inside its window; if not, it opens ConfirmAccessDialog and
// resolves once the person confirmed with their password (POST /api/me/sudo) or a passkey (a passkey log-in
// through Better Auth, which replaces this browser's session), or false when they cancel. The flow renders
// `dialog` in its own dialog's `stacked` slot.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { SUDO_REQUIRED } from "../../shared/sudo";
import { authClient } from "../auth";
import { api, apiError, ApiError, errorMessage, unwrap } from "../data/api";
import { usePasskeys } from "../data/account";
import { ConfirmAccessDialog } from "../design/settings/ConfirmAccessDialog";
import { passkeyFailure, passkeysSupported } from "./passkeys";

type Asking = { action: string; resolve: (confirmed: boolean) => void };

/** The server refused because the session is outside sudo mode (the app's routes, or Better Auth's passkey routes). */
export const sudoRequired = (err: unknown) => (err instanceof ApiError && err.fields.sudo === SUDO_REQUIRED) || (typeof err === "object" && err !== null && (err as { code?: string }).code === SUDO_REQUIRED);

export function useSudo({ online, email }: { online: boolean; email: string }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState<"password" | "passkey" | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passkeys = usePasskeys(!!asking);
  const finish = (confirmed: boolean) => {
    asking?.resolve(confirmed);
    setAsking(null);
    setBusy(null);
  };

  /** True once this session may do `action` ("delete your account"); false when the person cancels. */
  const confirm = async (action: string): Promise<boolean> => {
    const status = await api.api.me.sudo
      .$get()
      .then((r) => unwrap<{ confirmedUntil: string | null }>(r))
      .catch(() => null);
    if (status?.confirmedUntil) return true;
    setPasswordError(null);
    setPasskeyError(null);
    setError(null);
    return new Promise<boolean>((resolve) => setAsking({ action, resolve }));
  };

  const dialog = (
    <ConfirmAccessDialog
      open={!!asking}
      onClose={() => finish(false)}
      action={asking?.action ?? ""}
      email={email}
      busy={busy}
      offline={!online}
      passwordError={passwordError}
      passkeyError={passkeyError}
      error={error}
      onPassword={async (password) => {
        setBusy("password");
        setPasswordError(null);
        setError(null);
        const res = await api.api.me.sudo.$post({ json: { password } }).catch((err: unknown) => err);
        if (res instanceof Response && res.ok) return finish(true);
        const err = res instanceof Response ? await apiError(res) : res;
        setBusy(null);
        if (err instanceof ApiError && err.fields.password) setPasswordError(err.fields.password);
        else setError(errorMessage(err).replace(/\.$/, ""));
      }}
      onPasskey={
        passkeysSupported() && passkeys.data?.length
          ? async () => {
              setBusy("passkey");
              setPasskeyError(null);
              setError(null);
              const r = await authClient.signIn.passkey().catch((err: unknown) => ({ error: { code: "", message: errorMessage(err) } }));
              if (r.error) {
                setBusy(null);
                return setPasskeyError(passkeyFailure(r.error, "confirm"));
              }
              // The passkey log-in replaced this browser's session: Devices lists the new one.
              void qc.invalidateQueries({ queryKey: ["me", "sessions"] });
              finish(true);
            }
          : undefined
      }
    />
  );
  return { confirm, dialog };
}
