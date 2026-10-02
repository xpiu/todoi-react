import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ErrorBody } from "../shared/errors";
import { fail, notFound, onError, validate } from "./errors";

/** Drizzle wraps the driver's error and puts the SQL and its parameters in the message. */
const drizzleError = (code: string, constraint?: string) =>
  Object.assign(new Error('Failed query: insert into "labels" values ($1)\nparams: secret label name'), { cause: Object.assign(new Error("duplicate key value"), { code, constraint }) });

const app = new Hono()
  .use(requestId())
  .post("/items", validate("json", z.object({ title: z.string().min(1, "Give the item a title"), due: z.object({ date: z.string() }) })), (c) => c.json({ ok: true }))
  .get("/missing", (c) => fail(c, 404, "Item not found"))
  .get("/forbidden", () => {
    throw new HTTPException(403, { message: "You don't have access to this content" });
  })
  .get("/duplicate", () => {
    throw drizzleError("23505", "labels_name_per_project_idx");
  })
  .get("/down", () => {
    throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
  })
  .get("/bug", () => {
    throw new Error("token=abc in a bug");
  });
app.onError(onError).notFound(notFound);

const call = async (path: string, init?: RequestInit) => {
  const res = await app.request(path, init);
  return { status: res.status, header: res.headers.get("x-request-id"), body: (await res.json()) as ErrorBody };
};
const post = (body: string) => ({ method: "POST", body, headers: { "content-type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("API error envelope", () => {
  it("answers an invalid field with its message, every field's problem, and the request id", async () => {
    const r = await call("/items", post(JSON.stringify({ title: "", due: { date: 5 } })));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "Give the item a title", code: "invalid", fields: { title: "Give the item a title", "due.date": expect.any(String) } });
    expect(r.body.requestId).toBe(r.header);
    expect(r.body.requestId).toMatch(/.{8,}/);
  });

  it("answers malformed JSON as invalid, not as a crash", async () => {
    const r = await call("/items", post("{ title: oops"));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "Malformed JSON in request body", code: "invalid" });
  });

  it("gives route refusals, thrown access errors, and unknown routes the same shape", async () => {
    expect((await call("/missing")).body).toMatchObject({ error: "Item not found", code: "not_found" });
    expect(await call("/forbidden")).toMatchObject({ status: 403, body: { error: "You don't have access to this content", code: "forbidden" } });
    expect(await call("/nowhere")).toMatchObject({ status: 404, body: { code: "not_found" } });
  });

  it("maps a known unique violation to a specific conflict and logs it without SQL parameters", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await call("/duplicate");
    expect(r).toMatchObject({ status: 409, body: { error: "A label with that name already exists in this project", code: "conflict" } });
    const line = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ level: "warn", requestId: r.body.requestId, path: "/duplicate", status: 409, error: { db: "23505", constraint: "labels_name_per_project_idx" } });
    expect(JSON.stringify(line)).not.toContain("secret label name");
  });

  it("says when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await call("/down")).toMatchObject({ status: 503, body: { code: "unavailable" } });
  });

  it("hides an unexpected error's details from the response and logs them once under the request id", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call("/bug");
    expect(r).toMatchObject({ status: 500, body: { error: "Something went wrong on Todoi's side. Try again in a moment.", code: "internal" } });
    expect(JSON.stringify(r.body)).not.toContain("token");
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({ level: "error", requestId: r.body.requestId, status: 500, error: { name: "Error" } });
  });
});
