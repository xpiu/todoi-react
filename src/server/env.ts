import { z } from "zod";

// Node 22 loads `.env` natively via `--env-file`; see the npm scripts.
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const env = envSchema.parse(process.env);
