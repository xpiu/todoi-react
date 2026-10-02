// Node 22 loads `.env` natively via `--env-file`; see the npm scripts. The rules live in config.ts.
import { parseEnv } from "./config";

function load() {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (process.env.VITEST) throw error;
    // A readable refusal instead of a stack trace: the message lists every setting to fix.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export const env = load();
export const DEV = env.DEV;
