import { z } from "zod";

// Node 22 loads `.env` natively via `--env-file`; see the npm scripts.
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Apply pending Drizzle migrations when the API boots (development default) */
  MIGRATE_ON_START: z.stringbool().default(process.env.NODE_ENV !== "production"),
  /** Seed the kit's sample project when the database has no groups (development default) */
  SEED_ON_START: z.stringbool().default(process.env.NODE_ENV !== "production"),
});

export const env = envSchema.parse(process.env);
