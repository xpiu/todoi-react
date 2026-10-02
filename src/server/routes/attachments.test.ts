import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceAccess } from "../access";
import { attachments, items, lists, members, projects } from "../db/schema";
import { MAX_UPLOAD_REQUEST_BYTES } from "../../shared/uploads";
import { attachmentsRoute, itemAttachmentsRoute } from "./attachments";

const state = vi.hoisted(() => ({
  member: true,
  present: true,
  bytes: Buffer.from("<script>window.opener.location='/owned'</script>"),
  mime: "text/html",
  read: vi.fn(),
}));
const store = vi.hoisted(() => vi.fn());
vi.mock("../services/attachments", async (original) => ({ ...(await original<object>()), storeAttachments: store }));
vi.mock("../auth", () => ({ maybeViewer: () => ({ userId: "viewer" }), viewerOf: () => ({ userId: "viewer" }) }));
vi.mock("../services/uploads", () => ({
  openUpload: (key: string) => {
    state.read(key);
    return { size: state.bytes.byteLength, head: state.bytes.subarray(0, 16), stream: new Blob([state.bytes]).stream() };
  },
  saveUpload: vi.fn(),
  removeUpload: vi.fn(),
}));
// Exercise the real access middleware and file handler, with mutable persistence fixtures.
vi.mock("../db", () => ({ db: { select: () => ({ from: (table: unknown) => ({ where: async () => {
  if (table === attachments) return state.present ? [{ id: "file", itemId: "item", storageKey: "stored", name: "owner's file.html", mime: state.mime }] : [];
  if (table === items) return [{ id: "item", listId: "list", projectId: "project" }];
  if (table === lists) return [{ id: "list", projectId: "project" }];
  if (table === projects) return [{ visibility: "private" }];
  if (table === members) return state.member ? [{ role: "viewer" }] : [];
  throw new Error("Unexpected table");
} }) }) } }));

const app = new Hono().use("/api/*", workspaceAccess).route("/api/attachments", attachmentsRoute);

beforeEach(() => {
  state.member = true;
  state.present = true;
  state.mime = "text/html";
  state.bytes = Buffer.from("<script>window.opener.location='/owned'</script>");
  state.read.mockClear();
});

describe("attachment responses", () => {
  it.each([
    ["text/html", "<script>alert(document.cookie)</script>"],
    ["image/svg+xml", '<svg onload="alert(document.cookie)"/>'],
    ["image/png", "<script>alert(document.cookie)</script>"],
    ["application/pdf", "%PDF-1.7"],
    ["image/png", ""],
  ])("downloads untrusted %s bytes without active origin privileges", async (mime, source) => {
    state.mime = mime;
    state.bytes = Buffer.from(source);
    const response = await app.request("/api/attachments/file/file");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''owner%27s%20file.html");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(state.bytes);
  });

  it.each([
    ["image/png", "89504e470d0a1a0a"],
    ["image/jpeg", "ffd8ff"],
    ["image/gif", "474946383961"],
    ["image/gif", "474946383761"],
    ["image/webp", "524946460000000057454250"],
  ])("previews %s using its bytes, regardless of stored MIME", async (mime, hex) => {
    state.bytes = Buffer.from(hex, "hex");
    const response = await app.request("/api/attachments/file/file");
    expect(response.headers.get("content-type")).toBe(mime);
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    const download = await app.request("/api/attachments/file/file?download");
    expect(download.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(state.bytes);
  });

  it("rechecks access after membership is removed, before reading file bytes", async () => {
    expect((await app.request("/api/attachments/file/file")).status).toBe(200);
    state.member = false;
    state.read.mockClear();
    expect((await app.request("/api/attachments/file/file")).status).toBe(403);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("returns 404 when the attachment no longer exists", async () => {
    state.present = false;
    expect((await app.request("/api/attachments/file/file")).status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });
});

describe("attachment uploads", () => {
  const uploads = new Hono().route("/api/items", itemAttachmentsRoute);
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    uploads.request(new Request("http://test/api/items/item/attachments", { method: "POST", body, headers: { "content-type": "multipart/form-data; boundary=x", ...headers }, duplex: "half" } as RequestInit));

  beforeEach(() => store.mockReset());

  it("refuses a declared oversized request without reading it", async () => {
    let pulled = 0;
    const body = new ReadableStream({ pull: (c) => { pulled++; c.enqueue(new Uint8Array(1024)); } });
    const response = await post(body, { "content-length": String(MAX_UPLOAD_REQUEST_BYTES + 1) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "Uploads are limited to 25 MB per file", code: "too_large" });
    expect(pulled).toBeLessThanOrEqual(1);
    expect(store).not.toHaveBeenCalled();
  });

  it("stops reading an undeclared stream once it passes the limit", async () => {
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream({ pull: (c) => { sent += chunk.byteLength; if (sent > 100 * 1024 * 1024) c.close(); else c.enqueue(chunk); } });
    const response = await post(body, { "transfer-encoding": "chunked" });
    expect(response.status).toBe(413);
    expect(sent).toBeLessThan(MAX_UPLOAD_REQUEST_BYTES + 4 * chunk.byteLength);
    expect(store).not.toHaveBeenCalled();
  });
});
