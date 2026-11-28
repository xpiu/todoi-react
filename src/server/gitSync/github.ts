// The slice of GitHub's REST API Git sync uses, with `fetch` (no SDK): who the token is, a repository,
// its branches, one file's contents and blob sha, writing that file against the sha it was read at, and
// a push webhook. Every failure becomes a GitHubError with a reason the UI can explain. The base URL is
// GITHUB_API_URL, so tests and GitHub Enterprise use the same code.
import { env } from "../env";

export type GitHubReason = "unauthorized" | "forbidden" | "rate-limited" | "not-found" | "stale" | "too-large" | "not-a-file" | "unavailable" | "invalid";

export class GitHubError extends Error {
  constructor(
    readonly reason: GitHubReason,
    readonly status: number,
    message: string,
    /** When a rate limit lifts */
    readonly retryAt: Date | null = null,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface FileRef {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/** Files larger than this aren't synced: a task file that size is a mistake, and it would be slow everywhere. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

const encodePath = (path: string) => path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

export function githubClient(token: string, baseUrl: string = env.GITHUB_API_URL) {
  async function call(method: string, route: string, body?: unknown, accept = "application/vnd.github+json"): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl.replace(/\/$/, "")}${route}`, {
        method,
        headers: { authorization: `Bearer ${token}`, accept, "x-github-api-version": "2022-11-28", "user-agent": "todoi.com", ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new GitHubError("unavailable", 0, `GitHub didn't answer (${(e as Error).name === "TimeoutError" ? "timed out" : "network error"})`);
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => "");
    const message = (() => {
      try {
        return (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        return text;
      }
    })();
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if ((res.status === 403 || res.status === 429) && (res.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(message))) {
      throw new GitHubError("rate-limited", res.status, message, reset ? new Date(reset * 1000) : new Date(Date.now() + 60_000));
    }
    if (res.status === 401) throw new GitHubError("unauthorized", 401, message);
    if (res.status === 403) throw new GitHubError("forbidden", 403, message);
    if (res.status === 404) throw new GitHubError("not-found", 404, message);
    if (res.status === 409 || (res.status === 422 && /sha/i.test(message))) throw new GitHubError("stale", res.status, message);
    if (res.status >= 500) throw new GitHubError("unavailable", res.status, message);
    throw new GitHubError("invalid", res.status, message);
  }
  const json = async <T>(res: Response) => (await res.json()) as T;

  return {
    /** The account the token acts as */
    async user(): Promise<{ login: string }> {
      return json(await call("GET", "/user"));
    },
    async repo(owner: string, repo: string): Promise<{ fullName: string; defaultBranch: string; private: boolean; canPush: boolean }> {
      const r = await json<{ full_name: string; default_branch: string; private: boolean; permissions?: { push?: boolean } }>(await call("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`));
      return { fullName: r.full_name, defaultBranch: r.default_branch, private: r.private, canPush: r.permissions?.push ?? false };
    },
    async branchExists(owner: string, repo: string, branch: string): Promise<boolean> {
      try {
        await call("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`);
        return true;
      } catch (e) {
        if (e instanceof GitHubError && e.reason === "not-found") return false;
        throw e;
      }
    },
    /** The file's text and blob sha on the branch, or null when there is no file at that path. */
    async readFile(ref: FileRef): Promise<{ text: string; sha: string } | null> {
      let res: Response;
      try {
        res = await call("GET", `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contents/${encodePath(ref.path)}?ref=${encodeURIComponent(ref.branch)}`);
      } catch (e) {
        if (e instanceof GitHubError && e.reason === "not-found") return null;
        throw e;
      }
      const body = await json<unknown>(res);
      if (Array.isArray(body) || (body as { type?: string }).type !== "file") throw new GitHubError("not-a-file", 200, `${ref.path} is a folder, not a file`);
      const file = body as { sha: string; size: number; encoding?: string; content?: string };
      if (file.size > MAX_FILE_BYTES) throw new GitHubError("too-large", 200, `${ref.path} is ${(file.size / 1024 / 1024).toFixed(1)} MB; Git sync reads files up to 5 MB`);
      if (file.encoding === "base64" && file.content !== undefined) return { text: Buffer.from(file.content, "base64").toString("utf8"), sha: file.sha };
      // Over 1 MB the contents API leaves the content out; the blob has it.
      const raw = await call("GET", `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/blobs/${file.sha}`, undefined, "application/vnd.github.raw+json");
      return { text: await raw.text(), sha: file.sha };
    },
    /** Write the file as a commit on the branch. `sha` is the blob it was read at (null: create); a mismatch is "stale". */
    async writeFile(ref: FileRef, text: string, sha: string | null, message: string): Promise<{ sha: string; commitSha: string }> {
      if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new GitHubError("too-large", 0, "The file would be over 5 MB");
      const res = await call("PUT", `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contents/${encodePath(ref.path)}`, { message, content: Buffer.from(text, "utf8").toString("base64"), branch: ref.branch, ...(sha ? { sha } : {}) });
      const out = await json<{ content: { sha: string }; commit: { sha: string } }>(res);
      return { sha: out.content.sha, commitSha: out.commit.sha };
    },
    /** A push webhook on the repository, signed with `secret`. */
    async createHook(owner: string, repo: string, url: string, secret: string): Promise<number> {
      const res = await call("POST", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`, { name: "web", active: true, events: ["push"], config: { url, content_type: "json", secret, insecure_ssl: "0" } });
      return (await json<{ id: number }>(res)).id;
    },
    async deleteHook(owner: string, repo: string, id: number): Promise<void> {
      try {
        await call("DELETE", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${id}`);
      } catch (e) {
        if (!(e instanceof GitHubError && e.reason === "not-found")) throw e;
      }
    },
  };
}
export type GitHubClient = ReturnType<typeof githubClient>;
