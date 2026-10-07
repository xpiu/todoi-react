import type { CreateItemInput, UpdateItemInput } from "../../shared/items";
import { applyCompletion } from "../../shared/completion";
import type { Item, ProjectDetail } from "./api";
import { optimisticCreate } from "./itemOptimism";
import type { LocalWorkspace, SyncOperation } from "./syncStorage";

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
export const operationBody = (op: Pick<SyncOperation, "body">): Row => op.body ? object(JSON.parse(op.body)) : {};

/** Comment creation versions its parent item; dependent comment writes need the new child's baseline. */
export function createdCommentVersion(op: Pick<SyncOperation, "path" | "method" | "body">, responseBody: string): { resource: string; version: number } | undefined {
  if (op.method !== "POST" || !/^\/api\/items\/[^/]+\/comments$/.test(op.path) || !responseBody) return undefined;
  const id = operationBody(op).id;
  const comment = object(JSON.parse(responseBody));
  if (typeof id !== "string" || comment.id !== id || typeof comment.version !== "number" || !Number.isSafeInteger(comment.version) || comment.version <= 0) return undefined;
  return { resource: `comments/${id}`, version: comment.version };
}

export function resourceFor(path: string, body: Row): string | undefined {
  const parts = path.split("?")[0]!.split("/").filter(Boolean);
  if (parts[1] === "archive") parts.splice(1, 1);
  const kind = parts[1];
  if (!["items", "comments", "projects", "groups", "lists", "labels", "saved-views", "attachments"].includes(kind ?? "")) return undefined;
  const id = parts[2] ?? body.id;
  return typeof id === "string" && id !== "import" ? `${kind}/${id}` : undefined;
}

/** Find the authoritative row, never an optimistic version counter. */
export function rowFor(workspace: LocalWorkspace, resource: string): Row | undefined {
  const [kind, id] = resource.split("/");
  let newest: Row | undefined;
  const choose = (row: Row) => {
    if (row.id !== id) return;
    if (!newest) { newest = row; return; }
    // Target links return narrower rows than workspace snapshots. Preserve their missing fields.
    newest = Number(row.version ?? 0) >= Number(newest.version ?? 0) ? { ...newest, ...row } : { ...row, ...newest };
  };
  for (const [path, reply] of Object.entries(workspace.replies)) {
    const value: unknown = JSON.parse(reply.body);
    if (path.split("?")[0] === `/api/${kind}/${id}`) choose(object(value));
    const archived = path.startsWith("/api/archive") && (kind === "items" || kind === "projects");
    const candidates = Array.isArray(value) ? value : archived ? object(value)[kind!] : kind === "lists" ? object(value).lists : kind === "comments" ? object(value).comments : kind === "attachments" ? object(value).attachments : [];
    if (Array.isArray(candidates) && (archived || path.startsWith(`/api/${kind}`) || ["lists", "comments", "attachments"].includes(kind ?? ""))) {
      const row = candidates.find((candidate: unknown) => object(candidate).id === id);
      if (row) choose(object(row));
    }
    if (kind === "projects" && path.startsWith("/api/groups") && Array.isArray(value)) {
      for (const group of value) {
        const projects = object(group).projects;
        if (Array.isArray(projects)) {
          const row = projects.find((project: unknown) => object(project).id === id);
          if (row) choose(object(row));
        }
      }
    }
  }
  return newest;
}

export function projectFor(workspace: LocalWorkspace, path: string, body: Row = {}): string | undefined {
  const visited = new Set<string>();
  const resolve = (requestPath: string, fields: Row): string | undefined => {
    const url = new URL(requestPath, "http://todoi.local");
    const query = url.searchParams.get("projectId");
    if (query) return query;
    const project = /^\/api\/projects\/([^/]+)/.exec(url.pathname)?.[1];
    if (project && project !== "import") return project;
    if (typeof fields.projectId === "string") return fields.projectId;
    const resource = resourceFor(requestPath, fields);
    if (resource && visited.has(resource)) return undefined;
    if (resource) visited.add(resource);
    let row = resource ? rowFor(workspace, resource) : undefined;
    // New items and comments have no server row yet, but their queued creates retain their lineage.
    if (!row && resource) {
      const [kind, id] = resource.split("/");
      for (const op of workspace.operations) {
        if (op.method !== "POST") continue;
        const commentParent = kind === "comments" ? /^\/api\/items\/([^/]+)\/comments$/.exec(op.path)?.[1] : undefined;
        if (op.path !== `/api/${kind}` && !commentParent) continue;
        const draft = operationBody(op);
        if (draft.id === id) { row = commentParent ? { ...draft, itemId: commentParent } : draft; break; }
      }
    }
    if (typeof row?.projectId === "string") return row.projectId;
    if (typeof row?.itemId === "string") {
      const projectId = resolve(`/api/items/${row.itemId}`, {});
      if (projectId) return projectId;
    }
    const listId = typeof fields.listId === "string" ? fields.listId : row?.listId;
    if (typeof listId === "string") return resolve(`/api/lists/${listId}`, {});
    if (typeof row?.parentItemId === "string") return resolve(`/api/items/${row.parentItemId}`, {});
    return workspace.replies[requestPath]?.projectId;
  };
  return resolve(path, body);
}

/** Capture the user's chosen reaction state before enqueueing; fresh snapshots must not toggle it again. */
export function reactionIntent(workspace: LocalWorkspace, draft: Pick<SyncOperation, "path" | "method" | "body">): boolean | undefined {
  const match = /^\/api\/comments\/([^/]+)\/reactions$/.exec(draft.path);
  if (!match || draft.method !== "POST") return undefined;
  const emoji = operationBody(draft).emoji;
  if (typeof emoji !== "string") return undefined;
  const id = match[1]!;
  const row = rowFor(workspace, `comments/${id}`);
  let itemId = typeof row?.itemId === "string" ? row.itemId : undefined;
  if (!itemId) {
    const create = workspace.operations.find((op) => op.method === "POST" && /^\/api\/items\/[^/]+\/comments$/.test(op.path) && operationBody(op).id === id);
    itemId = create?.path.split("/")[3];
  }
  const details = reconcileSnapshot(`/api/items/${itemId ?? "reaction-intent"}/details`, { comments: row ? [row] : [] }, workspace) as { comments: Row[] };
  const comment = details.comments.find((candidate) => candidate.id === id);
  if (!comment) return undefined;
  const reactions = Array.isArray(comment.reactions) ? comment.reactions as Row[] : [];
  return !reactions.some((reaction) => reaction.userId === workspace.ownerId && reaction.emoji === emoji);
}

/** Fold one confirmed mutation into durable reply bases; other drafts remain overlays. */
export function acknowledgeReplies(record: LocalWorkspace, op: SyncOperation, responseBody: string): LocalWorkspace["replies"] {
  const confirmed = responseBody ? object(JSON.parse(responseBody)) : {};
  const kind = /^\/api\/items\/[^/]+\/comments$/.test(op.path) ? "comments" : resourceFor(op.path, operationBody(op))?.split("/")[0];
  const collections: Record<string, Row[]> = {};
  const canonical = kind === "items" ? confirmed.item ?? confirmed : kind === "lists" ? confirmed.list ?? confirmed : kind === "projects" ? confirmed.project ?? confirmed : confirmed;
  if (kind && typeof object(canonical).id === "string") {
    const { occurrence: _occurrence, ...row } = object(canonical);
    collections[kind] = [row];
  }
  if (Array.isArray(confirmed.items)) collections.items = confirmed.items.map(object);
  if (kind === "projects" && Array.isArray(confirmed.lists)) collections.lists = confirmed.lists.map(object);
  if (collections.items) collections.items = collections.items.map((row) => {
    const saved = rowFor(record, `items/${row.id}`);
    const current = Number(saved?.version ?? 0) > Number(row.version ?? 0) ? saved! : { ...saved, ...row };
    const [defaults] = optimisticCreate([], { id: String(row.id), title: typeof current.title === "string" ? current.title : "" }, { listId: typeof current.listId === "string" ? current.listId : "inbox", projectId: typeof current.projectId === "string" ? current.projectId : null, statusRole: null });
    return { ...defaults, ...current };
  });
  const destroyed = op.method === "DELETE" ? /^\/api\/archive\/(items|projects)\/([^/]+)$/.exec(op.path) : null;
  const acknowledged = typeof confirmed.reacted === "boolean" ? { ...op, reactionActive: confirmed.reacted } : op;
  const onlyConfirmed = { ...record, operations: [acknowledged] };
  const merge = (projected: Row, row: Row, previous: Row = {}) => Number(previous.version ?? 0) > Number(row.version ?? 0) ? previous : { ...projected, ...row };
  const mergeRows = (projected: unknown, previous: unknown, rows: Row[], accepts: (row: Row) => boolean = () => true): Row[] => {
    const current = Array.isArray(projected) ? projected.map(object) : [];
    const old = Array.isArray(previous) ? previous.map(object) : [];
    const existing = new Set(current.map((row) => row.id));
    return [...current.map((row) => {
      const actual = rows.find((candidate) => candidate.id === row.id);
      return actual ? merge(row, actual, old.find((candidate) => candidate.id === row.id)) : row;
    }), ...rows.filter((row) => !existing.has(row.id) && accepts(row))].filter(accepts);
  };
  return Object.fromEntries(Object.entries(record.replies).map(([path, reply]) => {
    const url = new URL(path, "http://todoi.local");
    const previous: unknown = JSON.parse(reply.body);
    let next = reconcileSnapshot(path, previous, onlyConfirmed);
    if (url.pathname === "/api/me" && op.method === "PATCH" && ["/api/me", "/api/me/prefs"].includes(op.path)) {
      const account = object(previous);
      next = op.path === "/api/me/prefs" ? { ...account, prefs: { ...object(account.prefs), ...confirmed } } : { ...account, ...confirmed, prefs: { ...object(account.prefs), ...object(confirmed.prefs) } };
    }
    if (url.pathname === "/api/items" && collections.items) {
      const projectId = url.searchParams.get("projectId"), listId = url.searchParams.get("listId");
      next = mergeRows(next, previous, collections.items, (row) => !row.archivedAt && !row.deletedAt && (projectId ? row.projectId === projectId : listId ? row.listId === listId : row.projectId === null));
    }
    const target = /^\/api\/(items|projects)\/([^/]+)$/.exec(url.pathname);
    if (target) {
      const row = collections[target[1]!]?.find((candidate) => candidate.id === target[2]);
      if (row) {
        next = merge(object(next), row, object(previous));
        if (target[1] === "items" && typeof object(previous).state === "string") {
          const item = object(next);
          const project = typeof item.projectId === "string" ? rowFor(record, `projects/${item.projectId}`) : undefined;
          const parent = typeof item.parentItemId === "string" ? rowFor(record, `items/${item.parentItemId}`) : undefined;
          const container = project?.archivedAt || project?.deletedAt || parent?.archivedAt || parent?.deletedAt;
          next = { ...item, state: item.deletedAt ? "deleted" : item.archivedAt ? "archived" : container ? "container" : "live" };
        }
      }
      if (target[1] === "projects" && collections.lists) next = { ...object(next), lists: mergeRows(object(next).lists, object(previous).lists, collections.lists, (list) => list.projectId === target[2]) };
    }
    const details = /^\/api\/items\/([^/]+)\/details$/.exec(url.pathname);
    if (details) {
      for (const key of ["comments", "attachments"]) if (collections[key]) next = { ...object(next), [key]: mergeRows(object(next)[key], object(previous)[key], collections[key]!, (row) => row.itemId === details[1]) };
    }
    if (url.pathname === "/api/groups" && Array.isArray(next)) {
      if (collections.groups) next = mergeRows(next, previous, collections.groups).map((row) => ({ ...row, projects: row.projects ?? [] }));
      if (collections.projects) next = (next as Row[]).map((group) => {
        const old = Array.isArray(previous) ? previous.map(object).find((candidate) => candidate.id === group.id) : undefined;
        return { ...group, projects: mergeRows(group.projects, old?.projects, collections.projects!, (project) => project.groupId === group.id && !project.archivedAt && !project.deletedAt) };
      });
    }
    if ((url.pathname === "/api/labels" || url.pathname === "/api/saved-views") && collections[url.pathname.split("/")[2]!]) next = mergeRows(next, previous, collections[url.pathname.split("/")[2]!]!, (row) => row.projectId === url.searchParams.get("projectId"));
    if (url.pathname === "/api/archive") for (const key of ["items", "projects"]) if (collections[key]) next = { ...object(next), [key]: mergeRows(object(next)[key], object(previous)[key], collections[key]!, (row) => !!(row.archivedAt || row.deletedAt) && (key === "projects" || !url.searchParams.get("projectId") || row.projectId === url.searchParams.get("projectId"))) };
    if (destroyed) {
      const removesItem = (row: Row) => destroyed[1] === "projects" ? row.projectId === destroyed[2] : row.id === destroyed[2] || row.parentItemId === destroyed[2];
      if (url.pathname === "/api/archive") {
        const archive = object(next);
        next = { ...archive, items: Array.isArray(archive.items) ? archive.items.map(object).filter((row) => !removesItem(row)) : [], projects: Array.isArray(archive.projects) ? archive.projects.map(object).filter((row) => destroyed[1] !== "projects" || row.id !== destroyed[2]) : [] };
      } else if (url.pathname === "/api/items" && Array.isArray(next)) next = next.map(object).filter((row) => !removesItem(row));
    }
    return [path, { ...reply, body: JSON.stringify(next) }];
  }));
}

/** Overlay unsent fields onto fresh snapshots; unrelated server changes continue to arrive. */
export function reconcileSnapshot(path: string, snapshot: unknown, workspace: LocalWorkspace): unknown {
  const url = new URL(path, "http://todoi.local");
  let result = snapshot;
  for (const op of workspace.operations) {
    // Access loss and permanent deletion must never resurrect server content.
    if (op.status === 403 || op.status === 404) continue;
    const body = operationBody(op);
    if (url.pathname === "/api/items" && Array.isArray(result)) {
      let rows = result as Item[];
      const projectId = url.searchParams.get("projectId");
      const listId = url.searchParams.get("listId");
      const matches = (row: Pick<Item, "projectId" | "listId">) => projectId ? row.projectId === projectId : listId ? row.listId === listId : row.projectId === null;
      if (op.path === "/api/items" && op.method === "POST" && typeof body.id === "string") {
        const existing = rows.find((row) => row.id === body.id);
        const destinationProjectId = projectFor(workspace, op.path, body);
        const savedProject = destinationProjectId ? rowFor(workspace, `projects/${destinationProjectId}`) ?? { id: destinationProjectId, lists: [] } : undefined;
        // The destination list may itself be queued. Reuse its projection up to this create's position.
        const project = savedProject ? reconcileSnapshot(`/api/projects/${destinationProjectId}`, savedProject, { ...workspace, operations: workspace.operations.slice(0, workspace.operations.indexOf(op)) }) as ProjectDetail : undefined;
        const list = project?.lists?.find((row) => row.id === body.listId) ?? (typeof body.listId === "string" ? rowFor(workspace, `lists/${body.listId}`) as ProjectDetail["lists"][number] | undefined : undefined);
        const dest = { listId: typeof body.listId === "string" ? body.listId : rows[0]?.listId ?? "inbox", projectId: destinationProjectId ?? null, statusRole: list?.statusRole ?? null };
        if (!existing && matches(dest)) rows = optimisticCreate(rows, body as unknown as CreateItemInput, dest);
      }
      const itemId = /^\/api\/items\/([^/]+)/.exec(op.path)?.[1];
      if (itemId) {
        if (op.method === "DELETE" && op.path === `/api/items/${itemId}`) rows = rows.filter((row) => row.id !== itemId && row.parentItemId !== itemId);
        else if (op.method === "PATCH" && op.path === `/api/items/${itemId}`) {
          rows = rows.map((row) => {
            if (row.id !== itemId) return row;
            const { done, status, ifDue, archived, deleted, ...patch } = body as UpdateItemInput;
            const next = { ...row, ...patch };
            const stale = done === true && !!next.repeatRule && ifDue !== undefined && next.dueDate !== ifDue;
            return { ...next, ...(stale ? {} : applyCompletion(next, { done, status }).patch), ...(archived ? { archivedAt: op.createdAt } : {}), ...(deleted ? { deletedAt: op.createdAt } : {}) };
          }).filter((row) => !row.archivedAt && !row.deletedAt && (!(body.archived || body.deleted) || row.parentItemId !== itemId));
        } else if (op.path.endsWith("/labels")) rows = rows.map((row) => row.id === itemId ? { ...row, labelIds: body.labelIds as string[] } : row);
        else if (op.path.endsWith("/assignees")) rows = rows.map((row) => row.id === itemId ? { ...row, assigneeIds: body.userIds as string[] } : row);
        else if (op.path.endsWith("/move")) {
          if (!rows.some((row) => row.id === itemId)) {
            const moving = rowFor(workspace, `items/${itemId}`) as Item | undefined;
            if (moving) {
              const family = Object.values(workspace.replies).flatMap((reply) => {
                const data: unknown = JSON.parse(reply.body);
                return Array.isArray(data) ? (data as Item[]).filter((row) => row.parentItemId === itemId && typeof row.listId === "string") : [];
              });
              const seen = new Set<string>();
              const uniqueFamily = family.filter((row) => {
                if (seen.has(row.id)) return false;
                seen.add(row.id);
                return true;
              });
              rows = [...rows, moving, ...uniqueFamily];
            }
          }
          rows = rows.map((row) => row.id === itemId || row.parentItemId === itemId ? { ...row, listId: body.listId as string, projectId: projectFor(workspace, "/api/items", { listId: body.listId }) ?? null, ...(typeof body.position === "number" ? { position: body.position } : {}) } : row).filter(matches);
        }
      }
      result = rows;
    } else if (/^\/api\/items\/[^/]+\/details$/.test(url.pathname)) {
      const itemId = url.pathname.split("/")[3];
      const details = object(result);
      const comments = Array.isArray(details.comments) ? details.comments as Row[] : [];
      if (op.path === `/api/items/${itemId}/comments` && op.method === "POST" && !comments.some((row) => row.id === body.id)) {
        result = { ...details, comments: [...comments, { ...body, itemId, authorId: workspace.ownerId, createdAt: op.createdAt, updatedAt: op.createdAt, reactions: [], version: 0 }] };
      } else if (/^\/api\/comments\/[^/]+\/reactions$/.test(op.path) && op.method === "POST") {
        const id = op.path.split("/")[3];
        result = { ...details, comments: comments.map((row) => {
          if (row.id !== id) return row;
          const reactions = Array.isArray(row.reactions) ? row.reactions as Row[] : [];
          const mine = (reaction: Row) => reaction.userId === workspace.ownerId && reaction.emoji === body.emoji;
          const present = reactions.some(mine);
          const active = op.reactionActive ?? !present;
          let projected = reactions;
          if (active && !present) projected = [...reactions, { commentId: id, userId: workspace.ownerId, emoji: body.emoji }];
          else if (!active && present) projected = reactions.filter((reaction) => !mine(reaction));
          return { ...row, reactions: projected };
        }) };
      } else if (/^\/api\/comments\/[^/]+$/.test(op.path) && ["PATCH", "DELETE"].includes(op.method)) {
        const id = op.path.split("/")[3];
        result = { ...details, comments: op.method === "DELETE" ? comments.filter((row) => row.id !== id) : comments.map((row) => row.id === id ? { ...row, ...body } : row) };
      } else if (/^\/api\/attachments\/[^/]+$/.test(op.path) && ["PATCH", "DELETE"].includes(op.method)) {
        const id = op.path.split("/")[3];
        const attachments = Array.isArray(details.attachments) ? details.attachments as Row[] : [];
        result = { ...details, attachments: op.method === "DELETE" ? attachments.filter((row) => row.id !== id) : attachments.map((row) => row.id === id ? { ...row, ...body } : row) };
      } else if (op.path === `/api/items/${itemId}/watch`) result = { ...details, watching: body.watching };
      else if (op.path === `/api/items/${itemId}/labels`) result = { ...details, labelIds: body.labelIds };
      else if (op.path === `/api/items/${itemId}/assignees`) result = { ...details, assigneeIds: body.userIds };
    } else if (/^\/api\/projects\/[^/]+$/.test(url.pathname)) {
      if (op.path === url.pathname && op.method === "PATCH") result = { ...object(result), ...body };
      const project = object(result);
      const lists = Array.isArray(project.lists) ? project.lists as Row[] : [];
      if (op.path === "/api/lists" && body.projectId === project.id && op.method === "POST" && !lists.some((row) => row.id === body.id)) result = { ...project, lists: [...lists, { ...body, position: lists.length, itemCount: 0, version: 0 }] };
      else if (op.path.startsWith("/api/lists/")) result = { ...project, lists: op.method === "DELETE" ? lists.filter((row) => row.id !== op.path.split("/")[3]) : lists.map((row) => row.id === op.path.split("/")[3] ? { ...row, ...body } : row) };
    } else if ((url.pathname === "/api/labels" || url.pathname === "/api/saved-views") && Array.isArray(result) && op.path.startsWith(url.pathname)) {
      const rows = result as Row[];
      const id = op.path.split("/")[3] ?? body.id;
      if (op.method === "POST" && op.path === url.pathname && body.projectId === url.searchParams.get("projectId") && !rows.some((row) => row.id === id)) result = [...rows, { ...body, version: 0 }];
      else if (op.method === "PATCH") result = rows.map((row) => row.id === id ? { ...row, ...body } : row);
      else if (op.method === "DELETE") result = rows.filter((row) => row.id !== id);
    } else if (url.pathname === "/api/groups" && Array.isArray(result)) {
      const groups = result as Row[];
      const groupId = /^\/api\/groups\/([^/]+)/.exec(op.path)?.[1];
      const projectId = /^\/api\/projects\/([^/]+)/.exec(op.path)?.[1];
      if (op.path === "/api/groups" && op.method === "POST" && !groups.some((row) => row.id === body.id)) result = [...groups, { ...body, projects: [], position: groups.length, version: 0 }];
      else if (groupId) result = op.method === "DELETE" ? groups.filter((row) => row.id !== groupId) : groups.map((row) => row.id === groupId ? { ...row, ...body } : row);
      else if (projectId) result = groups.map((group) => ({ ...group, projects: (group.projects as Row[] ?? []).flatMap((project) => {
        if (project.id !== projectId) return [project];
        if (op.method === "DELETE" || op.path.endsWith("/archive")) return [];
        return [{ ...project, ...body }];
      }) }));
    } else if (url.pathname === "/api/me" && op.method === "PATCH") {
      if (op.path === "/api/me/prefs") result = { ...object(result), prefs: { ...object(object(result).prefs), ...body } };
      else if (op.path === "/api/me") result = { ...object(result), ...body };
    }
  }
  return result;
}
