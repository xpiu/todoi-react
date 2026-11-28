// QA notes: only a confirmed @todoi.com account may send or read them; a note is stored with its screenshot
// and its email (to QA_REPORT_TO, replying to the sender, the PNG attached) leaves through the job queue.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { beforeAll, describe, expect, it } from "vitest";

import { call, confirmEmail, emailsTo, signUp, type Person } from "../../../tests/integration/accounts";
import { app } from "../app";
import { EMAIL_UNCONFIRMED } from "../../shared/accountLinks";
import type { QaContext } from "../../shared/qa";
import { db } from "../db";
import { qaReports } from "../db/schema";
import { env } from "../env";
import { defineJobs } from "../jobKinds";
import { runDueJobs } from "../jobs";
import { purgeOldQaScreenshots } from "../services/qaReports";
import { drainUploadCleanup } from "../services/uploadCleanup";
import { readUpload } from "../services/uploads";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]);
const context: QaContext = {
  url: "http://localhost:5173/inbox",
  title: "Inbox · todoi",
  userAgent: "Vitest",
  language: "en-US",
  timeZone: "Europe/Brussels",
  sentAt: new Date().toISOString(),
  viewport: { width: 1280, height: 800, dpr: 2 },
  screen: { width: 1512, height: 982 },
  appearance: { theme: "minimal", mode: "dark" },
  build: { sha: "dev", builtAt: null },
  online: true,
  strokes: 1,
  marked: [{ selector: "button.td-btn", text: "Add an item", rect: [1, 2, 3, 4] }],
  errors: [],
  capture: { ok: true, ms: 120 },
};

function send(person: Pick<Person, "cookie"> | null, parts: { text?: string; context?: unknown; screenshot?: Uint8Array | null } = {}) {
  const form = new FormData();
  form.append("text", parts.text ?? "The Add button jumps");
  form.append("context", typeof parts.context === "string" ? parts.context : JSON.stringify(parts.context ?? context));
  if (parts.screenshot !== null) form.append("screenshot", new File([new Uint8Array(parts.screenshot ?? PNG)], "shot.png", { type: "image/png" }));
  return app.request("/api/qa-reports", { method: "POST", headers: { origin: env.APP_URL, ...(person ? { cookie: person.cookie } : {}) }, body: form });
}

let staff: Person, unconfirmed: Person, customer: Person;
beforeAll(async () => {
  defineJobs();
  [staff, unconfirmed, customer] = await Promise.all([signUp("Flo", `${nanoid(8).toLowerCase()}@todoi.com`), signUp("Pretender", `${nanoid(8).toLowerCase()}@todoi.com`), signUp("Customer")]);
  await Promise.all([confirmEmail(staff), confirmEmail(customer)]);
});

describe("QA notes", () => {
  it("are for confirmed @todoi.com accounts only", async () => {
    expect((await send(null)).status).toBe(401);
    const refused = await send(customer);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toBe("QA notes are for todoi's own people");
    // One of ours who hasn't confirmed the address yet is told so, with the marker the tool sends the link on.
    const unproven = await send(unconfirmed);
    expect(unproven.status).toBe(403);
    expect(await unproven.json()).toMatchObject({ error: expect.stringMatching(/^Confirm your email address to send QA notes\./), fields: { confirmEmail: EMAIL_UNCONFIRMED } });
    for (const person of [unconfirmed, customer]) expect((await call("/api/qa-reports", { cookie: person.cookie })).status).toBe(403);
    expect((await call("/api/qa-reports")).status).toBe(403);
    expect(await db.select().from(qaReports)).toHaveLength(0);
  });

  it("store the note and its screenshot, then email both to the QA inbox", async () => {
    const res = await send(staff, { text: "  The Add button jumps  " });
    expect(res.status).toBe(201);
    const made = (await res.json()) as { id: string; text: string; screenshot: string; emailedAt: string | null };
    expect(made).toMatchObject({ text: "The Add button jumps", emailedAt: null, screenshot: `/api/qa-reports/${made.id}/screenshot` });

    const [row] = await db.select().from(qaReports).where(eq(qaReports.id, made.id));
    expect(row).toMatchObject({ userId: staff.id, email: staff.email, name: "Flo", url: context.url, screenshotSize: PNG.byteLength });
    expect(row!.context.marked[0]!.selector).toBe("button.td-btn");

    const shot = await call(made.screenshot, { cookie: staff.cookie });
    expect(shot.status).toBe(200);
    expect(shot.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await shot.arrayBuffer())).toEqual(PNG);
    expect((await call(made.screenshot, { cookie: customer.cookie })).status).toBe(403);

    await runDueJobs(50);
    const [email] = await emailsTo(env.QA_REPORT_TO);
    expect(email!.subject).toBe("[QA local] The Add button jumps");
    expect(email!.text).toContain(`From:        Flo <${staff.email}>`);
    expect(email!.text).toContain("Page:        http://localhost:5173/inbox");
    expect(email!.text).toContain("1. button.td-btn");
    const files = await readdir(env.EMAIL_DIR);
    const head = JSON.parse(await readFile(join(env.EMAIL_DIR, files.find((f) => f.endsWith(".json") && f.includes("qa-local"))!), "utf8")) as { replyTo: string; attachments: string[] };
    expect(head.replyTo).toBe(staff.email);
    expect(head.attachments).toEqual([expect.stringMatching(new RegExp(`^qa-\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d-\\d\\dZ-${made.id}\\.png$`))]);
    expect(new Uint8Array(await readFile(join(env.EMAIL_DIR, files.find((f) => f.endsWith(`${made.id}.png`))!)))).toEqual(PNG);
    expect((await db.select().from(qaReports).where(eq(qaReports.id, made.id)))[0]!.emailedAt).toBeInstanceOf(Date);

    // Sent once: running the queue again writes nothing new.
    await runDueJobs(50);
    expect(await emailsTo(env.QA_REPORT_TO)).toHaveLength(1);
    const list = (await (await call("/api/qa-reports", { cookie: staff.cookie })).json()) as Array<{ id: string; emailedAt: string | null }>;
    expect(list).toEqual([expect.objectContaining({ id: made.id, emailedAt: expect.any(String) })]);
    const one = (await (await call(`/api/qa-reports/${made.id}`, { cookie: staff.cookie })).json()) as { context: QaContext };
    expect(one.context.viewport).toEqual({ width: 1280, height: 800, dpr: 2 });
  });

  it("can be read and marked resolved by operators too, and open notes list first", async () => {
    const older = (await (await send(staff, { text: "Older note" })).json()) as { id: string };
    const newer = (await (await send(staff, { text: "Newer note" })).json()) as { id: string };
    env.ADMIN_EMAILS = [customer.email];
    try {
      const listed = async () => ((await (await call("/api/qa-reports", { cookie: customer.cookie })).json()) as Array<{ id: string; text: string; resolvedAt: string | null; marked: string[] }>).filter((n) => [older.id, newer.id].includes(n.id));
      expect((await listed()).map((n) => n.text)).toEqual(["Newer note", "Older note"]);
      expect((await listed())[0]!.marked).toEqual(["button.td-btn"]);
      // An operator may read and resolve, never write one.
      expect((await send(customer)).status).toBe(403);
      expect((await call(`/api/qa-reports/${newer.id}/screenshot`, { cookie: customer.cookie })).status).toBe(200);
      expect((await call(`/api/qa-reports/${newer.id}/resolve`, { method: "POST", cookie: customer.cookie })).status).toBe(204);
      expect((await call(`/api/qa-reports/${newer.id}/resolve`, { method: "POST", cookie: customer.cookie })).status).toBe(404);
      expect((await listed()).map((n) => [n.text, !!n.resolvedAt])).toEqual([["Older note", false], ["Newer note", true]]);
    } finally {
      env.ADMIN_EMAILS = [];
    }
    expect((await call(`/api/qa-reports/${older.id}/resolve`, { method: "POST", cookie: customer.cookie })).status).toBe(403);
    expect((await call(`/api/qa-reports/${older.id}/resolve`, { method: "POST", cookie: staff.cookie })).status).toBe(204);
  });

  it("lose only their screenshot after two years", async () => {
    const [old, recent] = (await Promise.all([send(staff, { text: "Old note" }), send(staff, { text: "Recent note" })].map(async (r) => (await r).json()))) as Array<{ id: string }>;
    const DAY = 24 * 60 * 60 * 1000;
    await db.update(qaReports).set({ createdAt: new Date(Date.now() - 733 * DAY) }).where(eq(qaReports.id, old!.id));
    await db.update(qaReports).set({ createdAt: new Date(Date.now() - 728 * DAY) }).where(eq(qaReports.id, recent!.id));
    const key = (await db.select().from(qaReports).where(eq(qaReports.id, old!.id)))[0]!.screenshotKey!;
    expect(await readUpload(key)).not.toBeNull();

    expect(await purgeOldQaScreenshots()).toBe(1);
    await drainUploadCleanup();
    expect(await readUpload(key)).toBeNull();
    // The note is all still there, without its picture.
    const [row] = await db.select().from(qaReports).where(eq(qaReports.id, old!.id));
    expect(row).toMatchObject({ text: "Old note", email: staff.email, url: context.url, screenshotKey: null, screenshotSize: PNG.byteLength });
    expect(row!.context.marked[0]!.selector).toBe("button.td-btn");
    const read = await call(`/api/qa-reports/${old!.id}`, { cookie: staff.cookie });
    expect(await read.json()).toMatchObject({ text: "Old note", screenshot: null });
    expect((await call(`/api/qa-reports/${old!.id}/screenshot`, { cookie: staff.cookie })).status).toBe(404);
    // A younger note keeps its screenshot, and a second run finds nothing more.
    expect((await call(`/api/qa-reports/${recent!.id}/screenshot`, { cookie: staff.cookie })).status).toBe(200);
    expect(await purgeOldQaScreenshots()).toBe(0);
  });

  it("refuse an empty note, a context that isn't one and a screenshot that isn't a PNG", async () => {
    const before = (await db.select().from(qaReports)).length;
    expect((await send(staff, { text: " ", context: { ...context, strokes: 0 } })).status).toBe(400);
    expect((await send(staff, { context: "not json" })).status).toBe(400);
    expect((await send(staff, { context: { ...context, viewport: undefined } })).status).toBe(400);
    expect((await send(staff, { context: { ...context, appearance: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`key${i}`, "x".repeat(40)])) } })).status).toBe(400);
    expect((await send(staff, { text: "x".repeat(5001) })).status).toBe(400);
    expect((await send(staff, { screenshot: new TextEncoder().encode("<svg onload=alert(1)>") })).status).toBe(400);
    expect(await db.select().from(qaReports)).toHaveLength(before);
    // A drawing alone is a note; so is text without a screenshot.
    expect((await send(staff, { text: "", context: { ...context, strokes: 3 } })).status).toBe(201);
    expect((await send(staff, { screenshot: null })).status).toBe(201);
  });
});
