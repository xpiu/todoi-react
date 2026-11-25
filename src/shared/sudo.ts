// "Sudo mode" (owner decisions Q6 and R1, 2026-11-25): deleting the account, changing the sign-in email and
// adding or removing a passkey ask the person to confirm it's them — with their password or a passkey —
// unless they did so in this session within the last SUDO_HOURS. A log-in doesn't count (GitHub's sudo
// mode, Laravel's password.confirm). Server: services/sudo.ts.

export const SUDO_HOURS = 2;

/** The refusal's marker: `fields.sudo` on the app's own routes, the error `code` on Better Auth's passkey routes. */
export const SUDO_REQUIRED = "SUDO_REQUIRED";
