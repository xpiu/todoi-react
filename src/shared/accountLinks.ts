// How long the links in account emails work: the server signs them with these lifetimes and the
// emails and pages quote them. Invites keep their own expiry (set per invite).

/** Password reset: one use, then gone */
export const RESET_LINK_MINUTES = 60;
/** Confirm an email address, at sign-up or for a change of address */
export const EMAIL_LINK_HOURS = 24;

/** "1 hour", "24 hours", "30 minutes" */
export function linkSpan(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
