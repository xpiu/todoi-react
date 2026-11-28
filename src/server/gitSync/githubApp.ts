// The GitHub App behind "Continue with GitHub": a person authorizes it and picks repositories on GitHub,
// so Git sync needs no pasted token. Three kinds of credential, none of them long-lived at rest but one:
//
// - the app's JWT (signed here with its private key, minutes long) asks which installation holds a repository;
// - an installation token (an hour, minted when needed and kept in memory) reads and writes the file;
// - the person's app token (sealed in github_accounts, refreshed when it expires) reaches only what both
//   they and the app can, which is what lists the repositories to pick from and proves one is theirs.
//
// That last point is the security of the whole flow: an installation id in a callback URL is never
// trusted, because anyone can type one. What a person may connect is what GitHub answers to their token.
import { createPrivateKey, createSign, randomBytes, timingSafeEqual, type KeyObject } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { githubAccounts, type GitHubAccount } from "../db/schema";
import { env } from "../env";
import { GitHubError, githubRequest, repoInfo, type RawRepo, type RepoInfo } from "./github";
import { open, seal } from "./secrets";

/** The app's settings, or null when Git sync connects with tokens only. */
export function githubApp() {
  const { GITHUB_APP_ID: id, GITHUB_APP_SLUG: slug, GITHUB_APP_CLIENT_ID: clientId, GITHUB_APP_CLIENT_SECRET: clientSecret, GITHUB_APP_PRIVATE_KEY: privateKey } = env;
  return id && slug && clientId && clientSecret && privateKey ? { id, slug, clientId, clientSecret, privateKey } : null;
}
const web = (path: string) => `${env.GITHUB_URL.replace(/\/$/, "")}${path}`;
/** Where the app is installed on an account, or given more repositories. */
export const installUrl = (state?: string) => web(`/apps/${githubApp()!.slug}/installations/new${state ? `?state=${state}` : ""}`);
export const authorizeUrl = (state: string) => web(`/login/oauth/authorize?client_id=${encodeURIComponent(githubApp()!.clientId)}&state=${state}&redirect_uri=${encodeURIComponent(callbackUrl())}`);
export const callbackUrl = () => new URL("/api/git/github/callback", env.APP_URL).toString();

// ── The app itself ───────────────────────────────────────────────────────────────────────────────────
let key: { pem: string; object: KeyObject } | null = null;
/** The private key however the host stored it: the PEM as is, with literal "\n", wrapped in quotes, or base64. */
function signingKey(): KeyObject {
  const raw = githubApp()!.privateKey;
  if (key?.pem === raw) return key.object;
  let pem = raw.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  if (!pem.includes("-----BEGIN")) pem = Buffer.from(pem, "base64").toString("utf8");
  key = { pem: raw, object: createPrivateKey(pem) };
  return key.object;
}

function appJwt(): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  // Issued a minute ago, for clocks that run ahead of GitHub's; ten minutes is the most GitHub accepts.
  const now = Math.floor(Date.now() / 1000);
  const head = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iat: now - 60, exp: now + 540, iss: githubApp()!.id })}`;
  return `${head}.${createSign("RSA-SHA256").update(head).sign(signingKey()).toString("base64url")}`;
}

const installationTokens = new Map<number, { token: string; expiresAt: number }>();
/** A token for one installation, reused until five minutes before it expires. */
export async function installationToken(installationId: number): Promise<string> {
  const held = installationTokens.get(installationId);
  if (held && held.expiresAt - Date.now() > 5 * 60_000) return held.token;
  installationTokens.delete(installationId);
  const res = await githubRequest(appJwt(), "POST", `/app/installations/${installationId}/access_tokens`);
  const out = (await res.json()) as { token: string; expires_at: string };
  installationTokens.set(installationId, { token: out.token, expiresAt: Date.parse(out.expires_at) });
  return out.token;
}
/** After GitHub refused a held token (the installation changed under it): the next sync asks for a new one. */
export const forgetInstallationToken = (installationId: number) => installationTokens.delete(installationId);

/** The installation that holds a repository, or null when the app isn't installed on it. */
export async function installationOf(owner: string, repo: string): Promise<number | null> {
  try {
    const res = await githubRequest(appJwt(), "GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`);
    return ((await res.json()) as { id: number }).id;
  } catch (e) {
    if (e instanceof GitHubError && e.reason === "not-found") return null;
    throw e;
  }
}

// ── A person's link ──────────────────────────────────────────────────────────────────────────────────
interface TokenGrant {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}
async function grant(params: Record<string, string>): Promise<TokenGrant> {
  const app = githubApp()!;
  try {
    const res = await fetch(web("/login/oauth/access_token"), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": "todoi.com" },
      body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, ...params }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? ((await res.json()) as TokenGrant) : { error: `status ${res.status}` };
  } catch {
    return { error: "unavailable" };
  }
}

async function saveGrant(userId: string, login: string, g: TokenGrant): Promise<void> {
  // GitHub may answer without a new refresh token: the one already held stays.
  const values = { login, tokenCipher: seal(g.access_token!), ...(g.refresh_token ? { refreshCipher: seal(g.refresh_token) } : {}), expiresAt: g.expires_in ? new Date(Date.now() + g.expires_in * 1000) : null };
  await db.insert(githubAccounts).values({ userId, ...values }).onConflictDoUpdate({ target: githubAccounts.userId, set: values });
}

/** Trade the code GitHub sent back for the person's token, and remember it. False when GitHub refuses the code. */
export async function linkAccount(userId: string, code: string): Promise<boolean> {
  const g = await grant({ code, redirect_uri: callbackUrl() });
  if (!g.access_token) return false;
  const { login } = (await (await githubRequest(g.access_token, "GET", "/user")).json()) as { login: string };
  await saveGrant(userId, login, g);
  return true;
}

/** The GitHub name they linked, from the database alone (no call to GitHub). */
export const linkedLogin = async (userId: string) => (await db.select({ login: githubAccounts.login }).from(githubAccounts).where(eq(githubAccounts.userId, userId)))[0]?.login ?? null;

export const unlinkAccount = (userId: string) => db.delete(githubAccounts).where(eq(githubAccounts.userId, userId));

// A refresh token works once: two requests refreshing at the same moment would lock the second one out.
const refreshing = new Map<string, Promise<string | null>>();
async function refresh(account: GitHubAccount): Promise<string | null> {
  const refreshToken = account.refreshCipher ? open(account.refreshCipher) : null;
  const g = refreshToken ? await grant({ grant_type: "refresh_token", refresh_token: refreshToken }) : { error: "no refresh token" };
  if (g.error === "unavailable") throw new GitHubError("unavailable", 0, "GitHub didn't answer");
  if (!g.access_token) {
    await unlinkAccount(account.userId);
    return null;
  }
  await saveGrant(account.userId, account.login, g);
  return g.access_token;
}

/** The person's GitHub link with a token that works now, or null when they have none (or it can't be renewed). */
export async function accountOf(userId: string): Promise<{ login: string; token: string } | null> {
  const [account] = await db.select().from(githubAccounts).where(eq(githubAccounts.userId, userId));
  if (!account) return null;
  let token = open(account.tokenCipher);
  if (!token || (account.expiresAt && account.expiresAt.getTime() - Date.now() < 60_000)) {
    let pending = refreshing.get(userId);
    if (!pending) {
      pending = refresh(account).finally(() => refreshing.delete(userId));
      refreshing.set(userId, pending);
    }
    token = await pending;
  }
  return token ? { login: account.login, token } : null;
}

/** Run `ask` as the person; a token GitHub no longer accepts (revoked on GitHub) ends the link and answers null. */
async function asPerson<T>(userId: string, ask: (token: string) => Promise<T>): Promise<T | null> {
  const account = await accountOf(userId);
  if (!account) return null;
  try {
    return await ask(account.token);
  } catch (e) {
    if (!(e instanceof GitHubError && e.reason === "unauthorized")) throw e;
    await unlinkAccount(userId);
    return null;
  }
}

export interface PickableRepo extends RepoInfo {
  installationId: number;
}
const PER_PAGE = 100, MAX_PAGES = 5;

/**
 * The repositories the person can pick: those the app is installed on that they can reach themselves.
 * Null when they have no working link; `more` when an account has more than is listed (name it by hand).
 */
export async function pickableRepos(userId: string): Promise<{ installations: number; repos: PickableRepo[]; more: boolean } | null> {
  return asPerson(userId, async (token) => {
    const { installations } = (await (await githubRequest(token, "GET", `/user/installations?per_page=${PER_PAGE}`)).json()) as { installations: Array<{ id: number; suspended_at?: string | null }> };
    const repos: PickableRepo[] = [];
    let more = false;
    for (const inst of installations.filter((i) => !i.suspended_at)) {
      for (let page = 1; ; page++) {
        const body = (await (await githubRequest(token, "GET", `/user/installations/${inst.id}/repositories?per_page=${PER_PAGE}&page=${page}`)).json()) as { total_count: number; repositories: RawRepo[] };
        repos.push(...body.repositories.map((r) => ({ ...repoInfo(r), installationId: inst.id })));
        if (page * PER_PAGE >= body.total_count || !body.repositories.length) break;
        if (page === MAX_PAGES) {
          more = true;
          break;
        }
      }
    }
    return { installations: installations.length, repos: repos.sort((a, b) => a.fullName.localeCompare(b.fullName)), more };
  });
}

export type AppAccess = { ok: true; installationId: number; token: string; repo: RepoInfo } | { ok: false; why: "unlinked" | "unreachable" | "read-only" };

/** May this person connect this repository through the app? Their own token decides; then the installation is found. */
export async function appAccess(userId: string, owner: string, repo: string): Promise<AppAccess> {
  let found: RepoInfo | null;
  try {
    const mine = await asPerson(userId, async (token) => repoInfo((await (await githubRequest(token, "GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)).json()) as RawRepo));
    if (!mine) return { ok: false, why: "unlinked" };
    found = mine;
  } catch (e) {
    // Outside the app's installations a person's app token sees nothing (404) or may not look (403).
    if (e instanceof GitHubError && (e.reason === "not-found" || e.reason === "forbidden")) return { ok: false, why: "unreachable" };
    throw e;
  }
  if (!found.canPush) return { ok: false, why: "read-only" };
  const installationId = await installationOf(found.owner, found.name);
  if (!installationId) return { ok: false, why: "unreachable" };
  return { ok: true, installationId, token: await installationToken(installationId), repo: found };
}

// ── The round trip to GitHub ─────────────────────────────────────────────────────────────────────────
/** What the browser carries to GitHub and back: a one-time `nonce` (GitHub returns it as `state`) and where to land. */
export interface RoundTrip {
  nonce: string;
  /** The path in the app to return to */
  next: string;
  /** "authorize" first; "install" once we sent the person on to install the app, so a second empty answer ends the trip */
  step: "authorize" | "install";
}
export const newNonce = () => randomBytes(24).toString("base64url");
export const sameNonce = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** Only a path inside the app: "/settings?s=storage", never "//evil.example" or a full URL. */
export const safeNext = (next: string | undefined) => (next && /^\/(?![/\\])/.test(next) ? next : "/settings?s=storage");
