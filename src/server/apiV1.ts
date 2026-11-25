// Todoi's versioned public API (work plan R5). /api/v1/… is a stable, documented subset of the app's own
// routes: the same handlers, permissions and errors, reached through a second prefix — routing sees
// /api/v1/items as /api/items (`routePath`, the Hono `getPath` of app.ts and index.ts). Only the operations
// listed here answer under /api/v1, and API tokens work there only, so a token never reaches account
// management (tokens, sign-in, deletion), invites, members or anything the app may still change. The
// unversioned /api is the app's own and may change with it. openapi.ts documents this table.
import type { Context, MiddlewareHandler } from "hono";
import { PatternRouter } from "hono/router/pattern-router";
import { getPath } from "hono/utils/url";

import { fail } from "./errors";

export const V1_PREFIX = "/api/v1";

export type V1Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export interface V1Operation {
  method: V1Method;
  /** The app route under /api, in Hono's pattern syntax */
  path: string;
  tag: "Account" | "Projects" | "Lists" | "Items" | "Comments" | "Labels" | "Search" | "Attachments";
  summary: string;
}

const op = (method: V1Method, path: string, tag: V1Operation["tag"], summary: string): V1Operation => ({ method, path, tag, summary });

export const V1_OPERATIONS: V1Operation[] = [
  op("GET", "/me", "Account", "The person the token acts for, with their preferences and Inbox list id"),
  op("GET", "/me/export", "Account", "Everything the person can see, as a .zip Todoi archive (not for a token limited to some projects)"),
  op("GET", "/groups", "Projects", "Project groups with their projects (a limited token sees only its projects)"),
  op("GET", "/projects/:id", "Projects", "A project with its lists and members"),
  op("GET", "/activity", "Projects", "A project's recent activity"),
  op("POST", "/lists", "Lists", "Add a list to a project"),
  op("PATCH", "/lists/:id", "Lists", "Rename, reorder or restyle a list"),
  op("GET", "/items", "Items", "Items in a project (?projectId=) or list (?listId=); with neither, the Inbox"),
  op("GET", "/items/:id", "Items", "One item"),
  op("GET", "/items/:id/details", "Items", "An item's labels, assignees, watchers, comments, relations, subitems and attachments"),
  op("POST", "/items", "Items", "Add an item; without listId it goes to the Inbox"),
  op("PATCH", "/items/:id", "Items", "Change an item's fields; { \"done\": true } completes it"),
  op("POST", "/items/:id/move", "Items", "Move an item to another list or position"),
  op("DELETE", "/items/:id", "Items", "Move an item to the Trash"),
  op("PUT", "/items/:id/labels", "Items", "Set an item's labels"),
  op("PUT", "/items/:id/assignees", "Items", "Set an item's assignees"),
  op("POST", "/items/:id/relations", "Items", "Relate an item to another"),
  op("DELETE", "/items/:id/relations", "Items", "Remove a relation"),
  op("POST", "/items/:id/comments", "Comments", "Comment on an item"),
  op("PATCH", "/comments/:id", "Comments", "Edit your comment"),
  op("DELETE", "/comments/:id", "Comments", "Delete your comment"),
  op("GET", "/labels", "Labels", "A project's labels"),
  op("POST", "/labels", "Labels", "Add a label to a project"),
  op("PATCH", "/labels/:id", "Labels", "Rename or recolour a label"),
  op("GET", "/search", "Search", "Find items by title or key"),
  op("GET", "/search/full", "Search", "Search titles, descriptions and comments, with filters and paging"),
  op("GET", "/items/:id/attachments", "Attachments", "An item's attachments"),
  op("GET", "/attachments/:id/file", "Attachments", "Download an attachment"),
];

/** Routing sees /api/v1/… as /api/…: v1 is the same handlers behind the gate below. */
export function routePath(request: Request): string {
  const path = getPath(request);
  return path.startsWith(`${V1_PREFIX}/`) ? `/api${path.slice(V1_PREFIX.length)}` : path;
}

/** Whether the request came in under /api/v1 (c.req.path is already the routed /api path). */
export const viaV1 = (c: Context) => getPath(c.req.raw).startsWith(`${V1_PREFIX}/`);

const operations = new PatternRouter<V1Operation>();
for (const o of V1_OPERATIONS) operations.add(o.method, `/api${o.path}`, o);
/** The v1 operation this request is, if any. */
export const v1OperationOf = (method: string, routedPath: string): V1Operation | undefined => operations.match(method === "HEAD" ? "GET" : method, routedPath)[0][0]?.[0];

/** Under /api/v1, only the listed operations answer; everything else is 404, as if it weren't there. */
export const v1Gate: MiddlewareHandler = async (c, next) => {
  if (viaV1(c) && !v1OperationOf(c.req.method, c.req.path)) return fail(c, 404, `That isn't part of Todoi's API v1. ${V1_PREFIX}/openapi.json lists what is.`);
  return next();
};
