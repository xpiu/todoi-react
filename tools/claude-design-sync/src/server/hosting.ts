// Where the server runs: on a developer's machine (the default: 127.0.0.1, no login) or hosted, e.g. in a
// Dokploy container behind a domain. Hosted means listening beyond loopback, which needs a login: the tool
// runs Claude Code with shell access, so it never serves an open port.

export interface Hosting {
  host: string;
  port: number;
  /** Basic Auth the server checks itself (Dokploy's proxy login uses the same pair) */
  auth?: { username: string; password: string };
  /** Push the branch a run merged into to `origin`, so CI/CD picks it up */
  pushAfterMerge: boolean;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function hostingFromEnv(env: NodeJS.ProcessEnv = process.env): Hosting {
  const host = env.CDS_HOST || "127.0.0.1";
  const username = env.CDS_BASIC_AUTH_USER;
  const password = env.CDS_BASIC_AUTH_PASS;
  if (Boolean(username) !== Boolean(password)) throw new Error("Set both CDS_BASIC_AUTH_USER and CDS_BASIC_AUTH_PASS, or neither.");
  const auth = username && password ? { username, password } : undefined;
  if (!LOOPBACK.has(host) && !auth) throw new Error(`CDS_HOST=${host} serves beyond this machine, so it needs CDS_BASIC_AUTH_USER and CDS_BASIC_AUTH_PASS.`);
  return { host, port: Number(env.CDS_PORT ?? 4477), auth, pushAfterMerge: env.CDS_PUSH_AFTER_MERGE === "1" };
}
