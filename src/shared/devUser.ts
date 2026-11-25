// The seeded development sign-in (README "Signing in"): the seed creates the account, the browser
// tests sign in with it. Development only — production seeds nothing.
export const DEV_USER = { email: "info@todoi.org", password: "todoi-dev-password" } as const;

/**
 * The screenshot gates' own copy of the sample workspace: never used by hand, and put back as seeded before
 * every browser run, so the visual baselines don't follow edits made in the dev account.
 */
export const GATE_USER = { email: "gates@todoi.org", password: DEV_USER.password } as const;
