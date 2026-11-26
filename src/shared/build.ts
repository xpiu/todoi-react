// Which build is running: the commit and the build time, stamped by vite.config.ts into the client and the
// server bundles. `npm run dev:api` runs the server source through tsx, without Vite, so it reads "dev".
declare const __TODOI_BUILD__: { sha: string; builtAt: string } | undefined;

export const BUILD: { sha: string; builtAt: string | null } =
  typeof __TODOI_BUILD__ === "undefined" ? { sha: "dev", builtAt: null } : __TODOI_BUILD__;

/** The commit as people quote it: its first 7 characters */
export const shortSha = (sha: string) => (/^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, 7) : sha);
