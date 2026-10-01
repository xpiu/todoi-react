import { z } from "zod";

// Node 22 loads `.env` natively via `--env-file`; see the npm scripts.
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Apply pending Drizzle migrations when the API boots (development default) */
  MIGRATE_ON_START: z.stringbool().default(process.env.NODE_ENV !== "production"),
  /** Seed the kit's sample project when the database has no groups (development default) */
  SEED_ON_START: z.stringbool().default(process.env.NODE_ENV !== "production"),
  /** Where uploaded attachment bytes live (local disk until an object store lands) */
  UPLOAD_DIR: z.string().default(".data/uploads"),
  /** Where the app is served (cookies, trusted origins, links in invites) */
  APP_URL: z.string().url().default("http://localhost:5173"),
  /** Better Auth signing secret — set a real one outside development */
  BETTER_AUTH_SECRET: z.string().min(16).default("todoi-dev-secret-change-me-please"),
});

export const env = envSchema.parse(process.env);
