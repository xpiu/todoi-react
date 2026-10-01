// The seeded development sign-in (README "Signing in"): the seed creates the account, the browser
// tests sign in with it. Development only — production seeds nothing.
export const DEV_USER = { email: "flo@todoi.com", password: "todoi-dev-password" } as const;
