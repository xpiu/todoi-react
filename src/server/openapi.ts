// The OpenAPI 3.1 contract of Todoi's API v1 (work plan R5), served at /api/v1/openapi.json. Built from the
// routes themselves: the operations are apiV1.ts's table, and each one's path, query and body come from the
// Zod schemas its `validate` middleware checks (errors.ts records them), so the document can't drift from
// what the server accepts. Responses are JSON (the shapes follow the app's own types; only errors are
// spelled out) unless the table says an operation returns a file.
import type { RouterRoute } from "hono/types";
import { z, type ZodType } from "zod";

import { ERROR_CODES } from "../shared/errors";
import { V1_OPERATIONS, V1_PREFIX, type V1Operation } from "./apiV1";
import { validationOf } from "./errors";

type Schema = Record<string, unknown>;

/** Zod → JSON Schema 2020-12 (OpenAPI 3.1's dialect), as a client sends it: defaults make fields optional. */
const jsonSchema = (schema: ZodType): Schema => {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", unrepresentable: "any" }) as Schema;
  return rest;
};

/** "/items/:id/comments" → "/items/{id}/comments" */
const openApiPath = (path: string) => path.replace(/:([A-Za-z]+)/g, "{$1}");
/** GET /items/:id/comments → getItemsByIdComments */
const operationId = (o: V1Operation) =>
  o.method.toLowerCase() + o.path.split("/").filter(Boolean).map((seg) => (seg.startsWith(":") ? `By${seg[1]!.toUpperCase()}${seg.slice(2)}` : seg.replace(/(^|-)([a-z])/g, (_m, _d, ch: string) => ch.toUpperCase()))).join("");

/** The schemas a route's validators check, by target (json, query, param…). */
function inputsOf(routes: RouterRoute[], o: V1Operation): Map<string, Schema> {
  const inputs = new Map<string, Schema>();
  for (const r of routes) {
    if (r.method !== o.method || r.path !== `/api${o.path}`) continue;
    // Route modules keep the app's error handler, so Hono registers their handlers unwrapped.
    const v = validationOf(r.handler);
    if (v) inputs.set(v.target, jsonSchema(v.schema));
  }
  return inputs;
}

const parametersOf = (where: "path" | "query", schema: Schema | undefined, pathNames: string[] = []) => {
  const props = (schema?.properties ?? {}) as Record<string, Schema>;
  const required = new Set((schema?.required ?? []) as string[]);
  const names = where === "path" ? pathNames : Object.keys(props);
  return names.map((name) => {
    const { description, ...rest } = props[name] ?? { type: "string" };
    return { name, in: where, required: where === "path" || required.has(name), schema: rest, ...(description ? { description } : {}) };
  });
};

function operationOf(routes: RouterRoute[], o: V1Operation) {
  const inputs = inputsOf(routes, o);
  const pathNames = [...o.path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]!);
  const writes = o.method !== "GET";
  const body = inputs.get("json");
  return {
    operationId: operationId(o),
    tags: [o.tag],
    summary: o.summary,
    ...(writes ? { description: "Needs a token with Read and write access." } : {}),
    parameters: [...parametersOf("path", inputs.get("param"), pathNames), ...parametersOf("query", inputs.get("query"))],
    ...(body ? { requestBody: { required: true, content: { "application/json": { schema: body } } } } : {}),
    responses: {
      "2XX": o.returns ? { description: "The file", content: { [o.returns.file]: { schema: { type: "string", contentEncoding: "binary" } } } } : { description: "Done; JSON unless there is nothing to say (204)", content: { "application/json": { schema: {} } } },
      "400": { $ref: "#/components/responses/Invalid" },
      "401": { $ref: "#/components/responses/Unauthorized" },
      "403": { $ref: "#/components/responses/Forbidden" },
      "404": { $ref: "#/components/responses/NotFound" },
      "429": { $ref: "#/components/responses/TooMany" },
    },
  };
}

const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

export function openApiDocument(routes: RouterRoute[], appUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const o of V1_OPERATIONS) (paths[openApiPath(o.path)] ??= {})[o.method.toLowerCase()] = operationOf(routes, o);
  return {
    openapi: "3.1.0",
    info: {
      title: "Todoi API",
      version: "1",
      description: "Read and change Todoi on someone's behalf with their personal API token. A token is read only or read and write, and reaches every project and the Inbox or only the projects picked when it was made. Guide: /docs/agents.",
      contact: { email: "info@todoi.com" },
    },
    servers: [{ url: `${appUrl}${V1_PREFIX}` }],
    security: [{ token: [] }],
    tags: [...new Set(V1_OPERATIONS.map((o) => o.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { token: { type: "http", scheme: "bearer", description: "A personal API token (tdi_…) from Account › API tokens" } },
      schemas: {
        Error: {
          type: "object",
          required: ["error", "code", "requestId"],
          properties: {
            error: { type: "string", description: "A plain sentence to show the person" },
            code: { type: "string", enum: [...ERROR_CODES] },
            requestId: { type: "string" },
            fields: { type: "object", additionalProperties: { type: "string" }, description: "Each invalid field's problem" },
          },
        },
      },
      responses: {
        Invalid: errorResponse("The request isn't valid; `fields` says which field and why"),
        Unauthorized: errorResponse("No token, or one that is unknown, expired or revoked"),
        Forbidden: errorResponse("The token can only read, can't reach that project, or its owner can't do this"),
        NotFound: errorResponse("Not found, or not part of API v1"),
        TooMany: errorResponse("Too many requests; wait for Retry-After seconds"),
      },
    },
  };
}
