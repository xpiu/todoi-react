// The API v1 contract can't drift: every listed operation is a real route, the document describes each one
// with the inputs its validators check, and it is served publicly at /api/v1/openapi.json only.
import { describe, expect, it } from "vitest";

import { call } from "../../tests/integration/accounts";
import { V1_OPERATIONS } from "./apiV1";
import { app } from "./app";

type Doc = { paths: Record<string, Record<string, { operationId: string; parameters: Array<{ name: string; in: string }>; requestBody?: { content: Record<string, { schema: { required?: string[]; properties?: Record<string, unknown> } }> } }>>; components: Record<string, Record<string, unknown>> };

describe("API v1 contract", () => {
  it("lists only operations the app really has", () => {
    for (const o of V1_OPERATIONS) expect(app.routes.some((r) => r.method === o.method && r.path === `/api${o.path}`), `${o.method} ${o.path}`).toBe(true);
  });

  it("is served publicly under /api/v1 only, and describes every operation with its inputs", async () => {
    const res = await call("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect((await call("/api/openapi.json")).status).toBe(404);
    const doc = (await res.json()) as Doc & { openapi: string; servers: Array<{ url: string }> };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0]!.url).toMatch(/\/api\/v1$/);

    const ops = Object.entries(doc.paths).flatMap(([path, byMethod]) => Object.entries(byMethod).map(([method, op]) => ({ path, method, op })));
    expect(ops).toHaveLength(V1_OPERATIONS.length);
    expect(new Set(ops.map((o) => o.op.operationId)).size).toBe(ops.length);
    for (const { path, op } of ops) {
      for (const name of [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1])) expect(op.parameters.some((p) => p.in === "path" && p.name === name), `${path} ${name}`).toBe(true);
    }
    // Inputs come from the routes' own schemas.
    const addItem = doc.paths["/items"]!.post!.requestBody!.content["application/json"]!.schema;
    expect(addItem.required).toEqual(expect.arrayContaining(["id", "title"]));
    expect(addItem.properties).toHaveProperty("dueDate");
    expect(doc.paths["/search"]!.get!.parameters).toContainEqual(expect.objectContaining({ name: "q", in: "query", required: true }));

    // Every reference resolves.
    for (const ref of JSON.stringify(doc).match(/"#\/components\/[^"]+"/g) ?? []) {
      const [, , section, name] = ref.slice(1, -1).split("/");
      expect(doc.components[section!]?.[name!], ref).toBeDefined();
    }
  });
});
