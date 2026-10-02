// Resource permissions apply to every API route, including guests. Reads may follow a shared
// project link; changes require membership, and workspace administration requires ownership.
import { and, eq, inArray } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import { maybeViewer, viewerOf } from "./auth";
import { db } from "./db";
import { attachments, comments, groups, invites, items, labels, lists, members, projects, savedViews, users } from "./db/schema";

type Permission = "read" | "edit" | "owner";
const missing = () => new HTTPException(404, { message: "Not found" });
const forbidden = () => new HTTPException(403, { message: "You don't have access to this content" });
const invalid = () => new HTTPException(400, { message: "Content must belong to the same project or Inbox" });

/** Centralized here so the public project and attachment reads use the same policy as CRUD. */
export const workspaceAccess: MiddlewareHandler = async (c, next) => {
  const viewer = maybeViewer(c);
  const read = c.req.method === "GET";
  const permission: Permission = read ? "read" : "edit";
  const [resource, id, action] = c.req.path.replace(/^\/api\//, "").split("/");
  // Hono caches JSON parsing; the route's Zod validator still validates all input fields.
  const body: Record<string, unknown> = !read && c.req.header("content-type")?.includes("application/json")
    ? await c.req.json().catch(() => ({})) : {};
  const field = (name: string) => typeof body?.[name] === "string" ? body[name] as string : undefined;
  const ids = (name: string): string[] => Array.isArray(body?.[name]) ? body[name].filter((v): v is string => typeof v === "string") : [];

  const projectAccess = async (projectId: string, required: Permission = permission) => {
    const [project] = await db.select({ visibility: projects.visibility }).from(projects).where(eq(projects.id, projectId));
    if (!project) throw missing();
    const [member] = viewer ? await db.select({ role: members.role }).from(members).where(and(eq(members.projectId, projectId), eq(members.userId, viewer.userId))) : [];
    const canRead = !!member || project.visibility === "public" || project.visibility === "shared" && !!viewer;
    if (required === "read" && canRead) return;
    if (required === "edit" && member && member.role !== "viewer") return;
    if (required === "owner" && member?.role === "owner") return;
    throw forbidden();
  };
  const groupAccess = async (groupId: string) => {
    const [group] = await db.select({ ownerId: groups.ownerId }).from(groups).where(eq(groups.id, groupId));
    if (!group) throw missing();
    if (group.ownerId !== viewer?.userId) throw forbidden();
  };
  const listAccess = async (listId: string, required: Permission = permission) => {
    const [list] = await db.select({ id: lists.id, projectId: lists.projectId, userId: lists.userId }).from(lists).where(eq(lists.id, listId));
    if (!list) throw missing();
    if (list.projectId) await projectAccess(list.projectId, required);
    else if (!viewer || list.userId !== viewer.userId) throw forbidden();
    return list;
  };
  const itemAccess = async (itemId: string, required: Permission = permission) => {
    const [item] = await db.select({ id: items.id, listId: items.listId, projectId: items.projectId, parentItemId: items.parentItemId }).from(items).where(eq(items.id, itemId));
    if (!item) throw missing();
    await listAccess(item.listId, required);
    return item;
  };
  const registered = () => {
    if (!viewer || viewer.isAnonymous) throw new HTTPException(401, { message: "Log in or create an account to continue" });
  };

  switch (resource) {
    case "groups":
      if (id) await groupAccess(id);
      break;
    case "projects":
      if (id && id !== "import") await projectAccess(id, action === "members" || action === "invites" || !read ? "owner" : "read");
      if (field("groupId")) await groupAccess(field("groupId")!);
      if (field("copyFrom")) await projectAccess(field("copyFrom")!, "read");
      if (action === "members" && !read && c.req.method !== "DELETE") {
        const targetId = c.req.path.split("/").at(-1)!;
        const [user] = await db.select().from(users).where(eq(users.id, targetId));
        if (!user || user.isAnonymous) throw invalid();
      }
      break;
    case "lists":
      if (id) await listAccess(id);
      if (field("projectId")) await projectAccess(field("projectId")!);
      break;
    case "items": {
      const item = id ? await itemAccess(id) : undefined;
      const projectId = read ? c.req.query("projectId") : undefined;
      const listId = read ? c.req.query("listId") : field("listId");
      if (projectId) await projectAccess(projectId);
      const list = listId ? await listAccess(listId) : !id && !projectId ? await listAccess(viewerOf(c).inboxListId) : undefined;
      const scope = item ?? (list ? { projectId: list.projectId, listId: list.id } : undefined);
      const parentId = field("parentItemId");
      if (parentId) {
        const parent = await itemAccess(parentId, "edit");
        if (parent.id === id || parent.parentItemId || parent.projectId !== scope?.projectId || !parent.projectId && parent.listId !== scope?.listId) throw invalid();
      }
      if (field("targetId")) {
        const target = await itemAccess(field("targetId")!, "edit");
        if (target.projectId !== item?.projectId || !target.projectId && target.listId !== item?.listId) throw invalid();
      }
      if (field("replyToId")) {
        const [reply] = await db.select().from(comments).where(eq(comments.id, field("replyToId")!));
        if (!reply || reply.itemId !== id) throw invalid();
      }
      const labelIds = ids("labelIds");
      if (labelIds.length) {
        const rows = await db.select().from(labels).where(inArray(labels.id, labelIds));
        if (new Set(labelIds).size !== rows.length || rows.some((l) => l.projectId !== scope?.projectId)) throw invalid();
      }
      const userIds = [...ids("assigneeIds"), ...ids("userIds")];
      if (userIds.length) {
        const allowed = scope?.projectId ? (await db.select().from(members).where(eq(members.projectId, scope.projectId))).map((m) => m.userId) : [viewer?.userId];
        if (userIds.some((u) => !allowed.includes(u))) throw invalid();
      }
      const cover = body?.cover as { attachmentId?: unknown } | undefined;
      if (typeof cover?.attachmentId === "string") {
        const [attachment] = await db.select().from(attachments).where(eq(attachments.id, cover.attachmentId));
        if (!attachment || attachment.itemId !== id) throw invalid();
      }
      break;
    }
    case "labels": {
      let projectId = read ? c.req.query("projectId") : field("projectId");
      if (id) {
        const [label] = await db.select().from(labels).where(eq(labels.id, id));
        if (!label) throw missing();
        projectId = label.projectId;
      }
      if (projectId) await projectAccess(projectId);
      if (field("intoLabelId")) {
        const [target] = await db.select().from(labels).where(eq(labels.id, field("intoLabelId")!));
        if (!target || target.projectId !== projectId) throw invalid();
      }
      break;
    }
    case "comments": {
      const [comment] = await db.select().from(comments).where(eq(comments.id, id!));
      if (!comment) throw missing();
      await itemAccess(comment.itemId);
      if (action !== "reactions" && comment.authorId !== viewer?.userId) throw forbidden();
      break;
    }
    case "attachments": {
      const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id!));
      if (!attachment) throw missing();
      await itemAccess(attachment.itemId);
      break;
    }
    case "saved-views":
      if (id) {
        const [view] = await db.select().from(savedViews).where(eq(savedViews.id, id));
        if (!view) throw missing();
        await projectAccess(view.projectId);
        if (view.ownerId !== viewer?.userId) throw forbidden();
      } else {
        const projectId = read ? c.req.query("projectId") : field("projectId");
        if (projectId) await projectAccess(projectId, "read");
      }
      break;
    case "activity":
      if (c.req.query("projectId")) await projectAccess(c.req.query("projectId")!);
      break;
    case "archive":
      if (id === "items") await itemAccess(action!);
      if (id === "projects") await projectAccess(action!, "owner");
      if (c.req.query("projectId")) await projectAccess(c.req.query("projectId")!);
      break;
    case "invites":
      if (!read) {
        if (action === "accept") registered();
        else {
          const [invite] = await db.select().from(invites).where(eq(invites.code, id!));
          if (!invite) throw missing();
          await projectAccess(invite.projectId, "owner");
        }
      }
      break;
    case "me":
      if (id === "tokens") registered();
      break;
  }
  await next();
};
