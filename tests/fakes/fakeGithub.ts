// A small in-memory stand-in for the GitHub REST API slice Git sync uses (src/server/gitSync/github.ts):
// tokens, repositories, branches, file contents with real git blob shas, writes that check the sha they
// were read at, and push webhooks signed like GitHub's. Integration tests start it in-process; browser
// tests run it as a process (`tsx tests/fakes/fakeGithub.ts 3199`) and point GITHUB_API_URL at it.
// `/_fake/*` routes let a test act as "someone else pushing". It also plays the GitHub App (githubApp.ts):
// the authorize and install pages (which send the browser straight back, as a person who agreed would),
// the code-for-token trade, a person's installations and their repositories, and installation tokens.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

interface FakeFile {
  text: string;
  sha: string;
}
interface FakeRepo {
  id: number;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  branches: Map<string, Map<string, FakeFile>>;
  hooks: Map<number, { url: string; secret: string }>;
  commits: Array<{ sha: string; branch: string; path: string; message: string }>;
}
interface FakeToken {
  login: string;
  /** Repos ("owner/name") it can see; push decides whether it can write */
  repos: string[];
  push: boolean;
}
/** The GitHub App as one person sees it: who they are and which repositories each installation gives them. */
interface FakeAppUser {
  login: string;
  /** installation id → repositories ("owner/name") */
  installations: Record<number, string[]>;
  push?: boolean;
  /** What the install page does: "install" (default) adds `onInstall`, "request" asks an owner instead */
  install?: "install" | "request";
  onInstall?: Record<number, string[]>;
}

export const blobSha = (text: string) => {
  const body = Buffer.from(text, "utf8");
  return createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
};

export function fakeGithubApp() {
  const repos = new Map<string, FakeRepo>();
  const tokens = new Map<string, FakeToken>();
  /** Every request, for assertions ("did it write?") */
  const requests: Array<{ method: string; path: string }> = [];
  let nextHook = 1, nextRepo = 1000, nextGrant = 1;
  /** The person "signed in to GitHub" in the browser, and the person each code and app token stands for */
  let appUser: FakeAppUser | null = null;
  const grants = new Map<string, FakeAppUser>();
  const expiring = { on: false };
  const issue = (u: FakeAppUser) => {
    const n = nextGrant++;
    const access = `ghu_fake_${n}`;
    grants.set(access, u);
    tokens.set(access, { login: u.login, get repos() { return Object.values(u.installations).flat(); }, push: u.push ?? true });
    if (!expiring.on) return { access_token: access, token_type: "bearer" };
    grants.set(`ghr_fake_${n}`, u);
    return { access_token: access, token_type: "bearer", expires_in: 28800, refresh_token: `ghr_fake_${n}`, refresh_token_expires_in: 15897600 };
  };
  const installationRepos = (id: number) => [...new Set([...grants.values(), ...(appUser ? [appUser] : [])].flatMap((u) => u.installations[id] ?? []))];
  /** Runs once, just before the next write is checked: a test's "someone pushed at that moment" */
  let beforeNextWrite: (() => Promise<unknown>) | null = null;
  const app = new Hono();

  const auth = (header: string | undefined) => tokens.get(header?.replace(/^Bearer\s+/i, "") ?? "");
  const repoFor = (owner: string, name: string, token: FakeToken | undefined) => {
    const r = repos.get(`${owner}/${name}`);
    return r && token?.repos.includes(`${owner}/${name}`) ? r : null;
  };
  const repoJson = (r: FakeRepo, push: boolean) => ({ id: r.id, name: r.name, full_name: `${r.owner}/${r.name}`, owner: { login: r.owner }, default_branch: r.defaultBranch, private: r.private, permissions: { push, pull: true } });
  /** Where the app's pages send the browser back when the request names no redirect_uri */
  let callback = "http://localhost:5173/api/git/github/callback";
  const deliver = async (repo: FakeRepo, branch: string, path: string, commitSha: string, change: "added" | "modified" | "removed") => {
    const payload = JSON.stringify({ ref: `refs/heads/${branch}`, after: commitSha, repository: { full_name: `${repo.owner}/${repo.name}`, name: repo.name, owner: { login: repo.owner } }, commits: [{ id: commitSha, added: change === "added" ? [path] : [], modified: change === "modified" ? [path] : [], removed: change === "removed" ? [path] : [] }] });
    await Promise.all(
      [...repo.hooks.values()].map((h) =>
        fetch(h.url, { method: "POST", headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": randomUUID(), "x-hub-signature-256": `sha256=${createHmac("sha256", h.secret).update(payload).digest("hex")}` }, body: payload }).catch(() => undefined),
      ),
    );
  };
  const commit = (repo: FakeRepo, branch: string, path: string, text: string | null, message: string) => {
    const files = repo.branches.get(branch)!;
    const sha = randomUUID().replace(/-/g, "") + "00000000";
    const existed = files.has(path);
    if (text === null) files.delete(path);
    else files.set(path, { text, sha: blobSha(text) });
    repo.commits.push({ sha, branch, path, message });
    return { sha, change: text === null ? ("removed" as const) : existed ? ("modified" as const) : ("added" as const) };
  };

  app.use("*", async (c, next) => {
    requests.push({ method: c.req.method, path: c.req.path });
    await next();
  });
  app.get("/user", (c) => {
    const t = auth(c.req.header("authorization"));
    return t ? c.json({ login: t.login }) : c.json({ message: "Bad credentials" }, 401);
  });
  app.get("/repos/:owner/:repo", (c) => {
    const t = auth(c.req.header("authorization"));
    if (!t) return c.json({ message: "Bad credentials" }, 401);
    const r = repoFor(c.req.param("owner"), c.req.param("repo"), t);
    if (!r) return c.json({ message: "Not Found" }, 404);
    return c.json(repoJson(r, t.push));
  });
  app.get("/repositories/:id", (c) => {
    const t = auth(c.req.header("authorization"));
    const r = [...repos.values()].find((x) => x.id === Number(c.req.param("id")));
    return r && t?.repos.includes(`${r.owner}/${r.name}`) ? c.json(repoJson(r, t.push)) : c.json({ message: "Not Found" }, 404);
  });

  // ── The GitHub App ──
  const back = (c: { req: { query: (k: string) => string | undefined } }, extra: Record<string, string>) => {
    const url = new URL(c.req.query("redirect_uri") ?? callback);
    for (const [k, v] of Object.entries({ ...extra, ...(c.req.query("state") ? { state: c.req.query("state")! } : {}) })) url.searchParams.set(k, v);
    return url.toString();
  };
  const newCode = (u: FakeAppUser) => {
    const code = `code_${nextGrant++}`;
    grants.set(code, u);
    return code;
  };
  app.get("/login/oauth/authorize", (c) => (appUser ? c.redirect(back(c, { code: newCode(appUser) })) : c.redirect(back(c, { error: "access_denied" }))));
  app.get("/apps/:slug/installations/new", (c) => {
    if (!appUser) return c.text("Sign in to GitHub", 401);
    if (appUser.install === "request") return c.redirect(back(c, { code: newCode(appUser), setup_action: "request" }));
    Object.assign(appUser.installations, appUser.onInstall ?? {});
    return c.redirect(back(c, { code: newCode(appUser), installation_id: String(Object.keys(appUser.installations)[0] ?? 1), setup_action: "install" }));
  });
  app.post("/login/oauth/access_token", async (c) => {
    const b = await c.req.json<{ code?: string; refresh_token?: string; grant_type?: string }>();
    const k = b.grant_type === "refresh_token" ? b.refresh_token : b.code;
    const u = k ? grants.get(k) : undefined;
    if (!u) return c.json({ error: b.grant_type ? "bad_refresh_token" : "bad_verification_code" });
    // A code and a refresh token each work once.
    grants.delete(k!);
    return c.json(issue(u));
  });
  app.get("/user/installations", (c) => {
    const u = grants.get(c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
    if (!u) return c.json({ message: "Bad credentials" }, 401);
    const ids = Object.keys(u.installations).map(Number);
    return c.json({ total_count: ids.length, installations: ids.map((id) => ({ id, suspended_at: null })) });
  });
  app.get("/user/installations/:id/repositories", (c) => {
    const u = grants.get(c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
    if (!u) return c.json({ message: "Bad credentials" }, 401);
    const mine = (u.installations[Number(c.req.param("id"))] ?? []).map((n) => repos.get(n)).filter((r): r is FakeRepo => !!r);
    const per = Number(c.req.query("per_page") ?? 30), page = Number(c.req.query("page") ?? 1);
    return c.json({ total_count: mine.length, repositories: mine.slice((page - 1) * per, page * per).map((r) => repoJson(r, u.push ?? true)) });
  });
  // The app's own JWT isn't verified here: three dot-separated parts are taken as the app.
  const isApp = (h: string | undefined) => (h?.replace(/^Bearer\s+/i, "") ?? "").split(".").length === 3;
  app.get("/repos/:owner/:repo/installation", (c) => {
    if (!isApp(c.req.header("authorization"))) return c.json({ message: "A JSON web token could not be decoded" }, 401);
    const name = `${c.req.param("owner")}/${c.req.param("repo")}`;
    const id = [...new Set([...grants.values(), ...(appUser ? [appUser] : [])])].flatMap((u) => Object.entries(u.installations)).find(([, names]) => names.includes(name))?.[0];
    return id ? c.json({ id: Number(id) }) : c.json({ message: "Not Found" }, 404);
  });
  app.post("/app/installations/:id/access_tokens", (c) => {
    if (!isApp(c.req.header("authorization"))) return c.json({ message: "A JSON web token could not be decoded" }, 401);
    const id = Number(c.req.param("id"));
    if (!installationRepos(id).length) return c.json({ message: "Not Found" }, 404);
    const token = `ghs_fake_${id}_${nextGrant++}`;
    // What the installation reaches is read when the token is used, so a repository taken away is gone at once.
    tokens.set(token, { login: "todoi[bot]", get repos() { return installationRepos(id); }, push: true });
    return c.json({ token, expires_at: new Date(Date.now() + 3600_000).toISOString() }, 201);
  });
  app.get("/repos/:owner/:repo/branches/:branch", (c) => {
    const r = repoFor(c.req.param("owner"), c.req.param("repo"), auth(c.req.header("authorization")));
    if (!r || !r.branches.has(c.req.param("branch"))) return c.json({ message: "Branch not found" }, 404);
    return c.json({ name: c.req.param("branch") });
  });
  app.get("/repos/:owner/:repo/contents/*", (c) => {
    const t = auth(c.req.header("authorization"));
    if (!t) return c.json({ message: "Bad credentials" }, 401);
    const r = repoFor(c.req.param("owner"), c.req.param("repo"), t);
    const path = decodeURIComponent(c.req.path.split("/contents/")[1] ?? "");
    const branch = c.req.query("ref") ?? r?.defaultBranch ?? "";
    const files = r?.branches.get(branch);
    if (!files) return c.json({ message: "No commit found for the ref" }, 404);
    const f = files.get(path);
    if (f) return c.json({ type: "file", path, sha: f.sha, size: Buffer.byteLength(f.text), encoding: "base64", content: Buffer.from(f.text).toString("base64") });
    if ([...files.keys()].some((k) => k.startsWith(`${path}/`))) return c.json([{ type: "file", path: `${path}/x` }]);
    return c.json({ message: "Not Found" }, 404);
  });
  app.put("/repos/:owner/:repo/contents/*", async (c) => {
    const t = auth(c.req.header("authorization"));
    if (!t) return c.json({ message: "Bad credentials" }, 401);
    const r = repoFor(c.req.param("owner"), c.req.param("repo"), t);
    if (!r) return c.json({ message: "Not Found" }, 404);
    if (!t.push) return c.json({ message: "Resource not accessible by personal access token" }, 403);
    const path = decodeURIComponent(c.req.path.split("/contents/")[1] ?? "");
    const body = await c.req.json<{ message: string; content: string; branch?: string; sha?: string }>();
    if (beforeNextWrite) {
      const run = beforeNextWrite;
      beforeNextWrite = null;
      await run();
    }
    const branch = body.branch ?? r.defaultBranch;
    const files = r.branches.get(branch);
    if (!files) return c.json({ message: "Branch not found" }, 404);
    const current = files.get(path);
    if (current && !body.sha) return c.json({ message: 'Invalid request.\n\n"sha" wasn\'t supplied.' }, 422);
    if (current && body.sha !== current.sha) return c.json({ message: `${path} does not match ${body.sha}` }, 409);
    if (!current && body.sha) return c.json({ message: `${path} does not match ${body.sha}` }, 409);
    const done = commit(r, branch, path, Buffer.from(body.content, "base64").toString("utf8"), body.message);
    await deliver(r, branch, path, done.sha, done.change);
    return c.json({ content: { path, sha: files.get(path)!.sha }, commit: { sha: done.sha } }, current ? 200 : 201);
  });
  app.post("/repos/:owner/:repo/hooks", async (c) => {
    const t = auth(c.req.header("authorization"));
    const r = repoFor(c.req.param("owner"), c.req.param("repo"), t);
    if (!r) return c.json({ message: "Not Found" }, 404);
    if (!t!.push) return c.json({ message: "Resource not accessible by personal access token" }, 403);
    const body = await c.req.json<{ config: { url: string; secret: string } }>();
    const id = nextHook++;
    r.hooks.set(id, { url: body.config.url, secret: body.config.secret });
    return c.json({ id }, 201);
  });
  app.delete("/repos/:owner/:repo/hooks/:id", (c) => {
    const r = repoFor(c.req.param("owner"), c.req.param("repo"), auth(c.req.header("authorization")));
    if (!r || !r.hooks.delete(Number(c.req.param("id")))) return c.json({ message: "Not Found" }, 404);
    return c.body(null, 204);
  });

  // ── Test controls ──
  const control = {
    addToken(token: string, t: FakeToken) {
      tokens.set(token, t);
    },
    addRepo(fullName: string, opts: { defaultBranch?: string; branches?: string[]; private?: boolean } = {}) {
      const [owner, name] = fullName.split("/") as [string, string];
      const defaultBranch = opts.defaultBranch ?? "main";
      repos.set(fullName, { id: nextRepo++, owner, name, defaultBranch, private: opts.private ?? true, branches: new Map([defaultBranch, ...(opts.branches ?? [])].map((b) => [b, new Map()])), hooks: new Map(), commits: [] });
    },
    /** Someone else's commit: write (or with null, delete) a file, and fire the push webhooks. */
    async push(fullName: string, branch: string, path: string, text: string | null, message = "Edit from GitHub") {
      const r = repos.get(fullName)!;
      const done = commit(r, branch, path, text, message);
      await deliver(r, branch, path, done.sha, done.change);
      return done.sha;
    },
    file(fullName: string, branch: string, path: string): FakeFile | null {
      return repos.get(fullName)?.branches.get(branch)?.get(path) ?? null;
    },
    repo: (fullName: string) => repos.get(fullName),
    /** Rename a repository in place (same id, hooks, files), as GitHub does. */
    rename(fullName: string, to: string) {
      const r = repos.get(fullName)!;
      [r.owner, r.name] = to.split("/") as [string, string];
      repos.delete(fullName);
      repos.set(to, r);
      for (const u of new Set([...grants.values(), ...(appUser ? [appUser] : [])])) for (const id of Object.keys(u.installations)) u.installations[Number(id)] = u.installations[Number(id)]!.map((n) => (n === fullName ? to : n));
    },
    /** Who is "signed in to GitHub" in the browser for the app's pages (null: they refuse), and where those pages send them back. */
    appUser(u: FakeAppUser | null, callbackUrl?: string) {
      appUser = u;
      if (callbackUrl) callback = callbackUrl;
      return u;
    },
    /** A code as GitHub would hand the callback, for tests that skip the browser. */
    codeFor: (u: FakeAppUser) => newCode(u),
    expireTokens(on: boolean) {
      expiring.on = on;
    },
    requests,
    beforeNextWrite(run: () => Promise<unknown>) {
      beforeNextWrite = run;
    },
    reset() {
      repos.clear();
      tokens.clear();
      grants.clear();
      appUser = null;
      requests.length = 0;
    },
  };
  app.post("/_fake/token", async (c) => {
    const b = await c.req.json<FakeToken & { token: string }>();
    control.addToken(b.token, b);
    return c.json({ ok: true });
  });
  app.post("/_fake/app-user", async (c) => {
    const b = await c.req.json<{ user: FakeAppUser | null; callback?: string }>();
    control.appUser(b.user, b.callback);
    return c.json({ ok: true });
  });
  app.post("/_fake/repo", async (c) => {
    const b = await c.req.json<{ fullName: string; defaultBranch?: string; branches?: string[] }>();
    control.addRepo(b.fullName, b);
    return c.json({ ok: true });
  });
  app.post("/_fake/push", async (c) => {
    const b = await c.req.json<{ fullName: string; branch: string; path: string; text: string | null; message?: string }>();
    return c.json({ sha: await control.push(b.fullName, b.branch, b.path, b.text, b.message) });
  });
  app.get("/_fake/file", (c) => c.json(control.file(c.req.query("repo")!, c.req.query("branch")!, c.req.query("path")!)));
  app.get("/_fake/hooks", (c) => c.json([...(control.repo(c.req.query("repo")!)?.hooks.values() ?? [])].map((h) => h.url)));
  return { app, control };
}

/** Start the fake on a port (0 = any free one). */
export async function startFakeGithub(port = 0) {
  const { app, control } = fakeGithubApp();
  return new Promise<{ url: string; close: () => Promise<void>; control: typeof control }>((resolve) => {
    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
      resolve({ url: `http://127.0.0.1:${info.port}`, control, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  const port = Number(process.argv[2] ?? 3199);
  void startFakeGithub(port).then((f) => console.log(`Fake GitHub API on ${f.url}`));
}
