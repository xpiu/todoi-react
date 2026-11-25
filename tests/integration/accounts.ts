// Helpers for integration tests that act as a signed-in person over HTTP (app.request) and read the
// emails the development transport wrote to EMAIL_DIR (setup.ts gives each test file its own folder).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";

import { app } from "../../src/server/app";
import { env } from "../../src/server/env";

export const PASSWORD = "integration-password";

export interface Person {
  id: string;
  email: string;
  name: string;
  cookie: string;
}

/** The cookies a response sets, as one Cookie header (merged over the previous one). */
export function cookiesFrom(res: Response, previous = ""): string {
  const jar = new Map(previous.split("; ").filter(Boolean).map((c) => [c.slice(0, c.indexOf("=")), c] as const));
  for (const line of res.headers.getSetCookie()) {
    const pair = line.split(";")[0]!;
    const name = pair.slice(0, pair.indexOf("="));
    if (/max-age=0/i.test(line) || pair.endsWith("=")) jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join("; ");
}

/** A request as the browser makes it: same origin, JSON body, the person's cookies. */
export function call(path: string, init: { method?: string; json?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  return app.request(path, {
    method: init.method ?? (init.json === undefined ? "GET" : "POST"),
    headers: { origin: env.APP_URL, ...(init.json === undefined ? {} : { "content-type": "application/json" }), ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });
}

export async function signUp(name = "Test person", email = `${nanoid(10).toLowerCase()}@example.test`): Promise<Person> {
  const res = await call("/api/auth/sign-up/email", { json: { name, email, password: PASSWORD } });
  if (!res.ok) throw new Error(`Sign-up failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, email, name, cookie: cookiesFrom(res) };
}

export async function signIn(email: string, password = PASSWORD): Promise<string> {
  const res = await call("/api/auth/sign-in/email", { json: { email, password } });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  return cookiesFrom(res);
}

/** Confirm it's you with the password in this session (sudo mode, services/sudo.ts): a log-in alone doesn't count. */
export async function confirmIt(cookie: string, password = PASSWORD) {
  const res = await call("/api/me/sudo", { cookie, json: { password } });
  if (!res.ok) throw new Error(`Confirming failed: ${res.status} ${await res.text()}`);
}

export interface SentEmail { to: string; subject: string; html: string; text: string; link: string | undefined }

/** Every email written so far to an address, oldest first; `link` is the first app link in the text part. */
export async function emailsTo(to: string): Promise<SentEmail[]> {
  const names = (await readdir(env.EMAIL_DIR).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort();
  const out: SentEmail[] = [];
  for (const name of names) {
    const head = JSON.parse(await readFile(join(env.EMAIL_DIR, name), "utf8")) as { to: string; subject: string };
    if (head.to !== to) continue;
    const stem = join(env.EMAIL_DIR, name.slice(0, -".json".length));
    const text = await readFile(`${stem}.txt`, "utf8");
    out.push({ ...head, html: await readFile(`${stem}.html`, "utf8"), text, link: text.match(new RegExp(`${env.APP_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S+`))?.[0] });
  }
  return out;
}

/** Follow an emailed link through the API (app.request wants a path); returns the redirect target. */
export async function openLink(link: string, cookie?: string): Promise<{ status: number; location: string | null; cookie: string }> {
  const url = new URL(link);
  const res = await call(url.pathname + url.search, { cookie });
  return { status: res.status, location: res.headers.get("location"), cookie: cookiesFrom(res, cookie) };
}
