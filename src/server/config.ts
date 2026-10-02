import { z } from "zod";

// The API's configuration rules, pure so they can be tested (src/server/env.ts applies them to process.env).
// Development gets working defaults; production (NODE_ENV=production) must be configured explicitly and
// refuses to start otherwise, because a known signing secret lets anyone forge sessions and the seed
// creates accounts with a published password.

/** The development signing secret in `.env.example`; never accepted in production. */
export const DEV_AUTH_SECRET = "todoi-dev-secret-change-me-please";
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export function parseEnv(source: Record<string, string | undefined>) {
  const dev = source.NODE_ENV !== "production";
  const schema = z
    .object({
      DATABASE_URL: z.string().url(),
      PORT: z.coerce.number().int().positive().default(3000),
      /** Apply pending Drizzle migrations when the API boots (development default; production runs `npm run db:migrate` or sets this) */
      MIGRATE_ON_START: z.stringbool().default(dev),
      /** Seed the kit's sample workspace and its two dev accounts (development only) */
      SEED_ON_START: z.stringbool().default(dev),
      /** Where uploaded attachment bytes live; a persistent volume in production */
      UPLOAD_DIR: z.string().default(".data/uploads"),
      /** Where the app is served (cookies, trusted origins, links in invites) */
      APP_URL: dev ? z.string().url().default("http://localhost:5173") : z.string({ error: "Set APP_URL to the public URL the app is served from" }).url(),
      /** Better Auth signing secret: 32+ random characters outside development (`openssl rand -base64 32`) */
      BETTER_AUTH_SECRET: dev ? z.string().min(16).default(DEV_AUTH_SECRET) : z.string({ error: "Set BETTER_AUTH_SECRET to 32+ random characters (openssl rand -base64 32)" }).min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
      /** The built client (`npm run build`) the API serves in production; empty to serve the API only */
      CLIENT_DIR: z.string().default(dev ? "" : "dist"),
    })
    .superRefine((e, ctx) => {
      if (dev) return;
      if (e.BETTER_AUTH_SECRET === DEV_AUTH_SECRET || /change-me|dev-secret|ci-only|example/i.test(e.BETTER_AUTH_SECRET)) ctx.addIssue({ code: "custom", path: ["BETTER_AUTH_SECRET"], message: "BETTER_AUTH_SECRET is a development or example value; generate a new one (openssl rand -base64 32)" });
      const url = new URL(e.APP_URL);
      if (url.protocol !== "https:" && !LOOPBACK.test(url.hostname)) ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use https outside localhost (session cookies are secure-only)" });
      if (e.SEED_ON_START) ctx.addIssue({ code: "custom", path: ["SEED_ON_START"], message: "SEED_ON_START creates demo accounts with a published password; it is development-only" });
    });
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Todoi can't start: the ${dev ? "development" : "production"} configuration is invalid.\n${lines.join("\n")}`);
  }
  return { ...parsed.data, DEV: dev };
}
