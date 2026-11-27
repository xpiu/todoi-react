import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMailer, EmailNotSent } from "./transport";

const message = { to: "flo@todoi.com", subject: "Reset your todoi password", html: "<p>hi</p>", text: "hi\n" };
const FROM = "todoi <no-reply@todoi.com>";
let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("the development transport", () => {
  it("writes the HTML, the text and the headers to the folder and logs one line", async () => {
    dir = await mkdtemp(join(tmpdir(), "todoi-emails-"));
    const log = vi.fn();
    await createMailer({ EMAIL_FROM: FROM, EMAIL_DIR: join(dir, "nested") }, { log, now: () => new Date("2026-11-25T10:00:00.000Z") })(message);
    const files = (await readdir(join(dir, "nested"))).sort();
    expect(files.map((f) => f.replace(/-[A-Za-z0-9_-]{6}\./, "."))).toEqual(["2026-11-25T10-00-00-000Z-reset-your-todoi-password.html", "2026-11-25T10-00-00-000Z-reset-your-todoi-password.json", "2026-11-25T10-00-00-000Z-reset-your-todoi-password.txt"]);
    const read = (ext: string) => readFile(join(dir!, "nested", files.find((f) => f.endsWith(ext))!), "utf8");
    expect(await read(".html")).toBe("<p>hi</p>");
    expect(await read(".txt")).toBe("hi\n");
    expect(JSON.parse(await read(".json"))).toEqual({ from: FROM, to: "flo@todoi.com", subject: "Reset your todoi password", date: "2026-11-25T10:00:00.000Z" });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]![0]).toMatch(/^Email to flo@todoi\.com · Reset your todoi password → .*\.html/);
  });
});

describe("the Resend transport", () => {
  it("posts one multipart email with the key, the sender and both parts", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    await createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: FROM, EMAIL_DIR: "unused" }, { fetch })(message);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test", "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ from: FROM, to: ["flo@todoi.com"], subject: message.subject, html: message.html, text: message.text });
  });

  it("turns a refusal or no answer into a short reason", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refused = createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: FROM, EMAIL_DIR: "unused" }, { fetch: async () => new Response(JSON.stringify({ message: "The domain is not verified" }), { status: 403 }) });
    await expect(refused(message)).rejects.toEqual(new EmailNotSent("the mail service refused it"));
    expect(error.mock.calls[0]![0]).toContain("The domain is not verified");
    const limited = createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: FROM, EMAIL_DIR: "unused" }, { fetch: async () => new Response("{}", { status: 429 }) });
    await expect(limited(message)).rejects.toThrow("too many emails at once");
    const down = createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: FROM, EMAIL_DIR: "unused" }, { fetch: async () => { throw new TypeError("fetch failed"); } });
    await expect(down(message)).rejects.toThrow("the mail service didn't answer");
    error.mockRestore();
  });
});
