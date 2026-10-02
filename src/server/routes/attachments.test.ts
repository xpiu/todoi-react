import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceAccess } from "../access";
import { attachments, items, lists, members, projects } from "../db/schema";
import { attachmentsRoute } from "./attachments";

const state = vi.hoisted(() => ({
  member: true,
  present: true,
  bytes: Buffer.from("<script>window.opener.location='/owned'</script>"),
  mime: "text/html",
  read: vi.fn(),
}));
vi.mock("../auth", () => ({ maybeViewer: () => ({ userId: "viewer" }), viewerOf: () => ({ userId: "viewer" }) }));
vi.mock("../services/uploads", () => ({ readUpload: (key: string) => { state.read(key); return state.bytes; }, saveUpload: vi.fn(), removeUpload: vi.fn() }));
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
