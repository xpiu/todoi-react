import { describe, expect, it } from "vitest";

import { DEV_AUTH_SECRET, parseEnv } from "./config";

const DATABASE_URL = "postgres://localhost:5432/todoi_react";
const prod = (extra: Record<string, string>) => parseEnv({ NODE_ENV: "production", DATABASE_URL, ...extra });
const SECRET = "q8Vb3J0r6m1Zy4Kd9Xs2Lw7Tn5Pc0Hf8";

describe("server configuration", () => {
  it("runs locally with nothing but a database", () => {
    const env = parseEnv({ DATABASE_URL });
    expect(env).toMatchObject({ DEV: true, APP_URL: "http://localhost:5173", BETTER_AUTH_SECRET: DEV_AUTH_SECRET, MIGRATE_ON_START: true, SEED_ON_START: true, CLIENT_DIR: "" });
  });

  it("refuses production without an explicit URL and secret, naming both", () => {
    expect(() => parseEnv({ NODE_ENV: "production", DATABASE_URL })).toThrow(/production configuration is invalid[\s\S]*APP_URL[\s\S]*BETTER_AUTH_SECRET/);
  });

  it("refuses production with the development, example or a short secret", () => {
    expect(() => prod({ APP_URL: "https://todoi.com", BETTER_AUTH_SECRET: DEV_AUTH_SECRET })).toThrow(/development or example value/);
    expect(() => prod({ APP_URL: "https://todoi.com", BETTER_AUTH_SECRET: "ci-only-secret-not-for-production-use" })).toThrow(/development or example value/);
    expect(() => prod({ APP_URL: "https://todoi.com", BETTER_AUTH_SECRET: "short-but-random-1234" })).toThrow(/at least 32/);
  });

  it("refuses plain http outside localhost and the demo seed in production", () => {
    expect(() => prod({ APP_URL: "http://todoi.com", BETTER_AUTH_SECRET: SECRET })).toThrow(/https/);
    expect(() => prod({ APP_URL: "https://todoi.com", BETTER_AUTH_SECRET: SECRET, SEED_ON_START: "true" })).toThrow(/SEED_ON_START/);
  });

  it("accepts a configured production, including a local smoke test over http://localhost", () => {
    expect(prod({ APP_URL: "https://todoi.com", BETTER_AUTH_SECRET: SECRET })).toMatchObject({ DEV: false, MIGRATE_ON_START: false, SEED_ON_START: false, CLIENT_DIR: "dist" });
    expect(prod({ APP_URL: "http://localhost:3000", BETTER_AUTH_SECRET: SECRET }).APP_URL).toBe("http://localhost:3000");
  });
});
