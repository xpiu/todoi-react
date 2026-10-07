import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { create } from "zustand";

import type { SessionUser } from "../auth";
import { acknowledgeReplies, createdCommentVersion, operationBody, projectFor, reactionIntent, reconcileSnapshot, resourceFor, rowFor } from "./syncModel";
import { readWorkspace, updateWorkspace, type LocalWorkspace, type SyncOperation } from "./syncStorage";
export type { SyncOperation } from "./syncStorage";

interface SyncState {
  ownerId: string | null;
  user: SessionUser | null;
  operations: SyncOperation[];
  saving: boolean;
  persisting: number;
  transientRequests: number;
  storageError: string | null;
  lastSynced: string | null;
}
export const useSyncState = create<SyncState>(() => ({ ownerId: null, user: null, operations: [], saving: false, persisting: 0, transientRequests: 0, storageError: null, lastSynced: null }));

const OWNER_KEY = "td-sync-owner";
const WORKSPACE_KEYS = new Set(["groups", "project", "items", "item", "labels", "saved-views", "archive", "inbox", "activity", "search", "me"]);
const queueable = (path: string) => /^\/api\/(items|comments|groups|projects|lists|labels|saved-views|archive|inbox|attachments|activity|search)(\/|$)/.test(path) && !path.includes("/file") || path === "/api/me/prefs" || path === "/api/me";
let client: QueryClient | undefined;
let workspace: LocalWorkspace | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let drain: Promise<void> | undefined;
let restoring = false;
const waiters = new Map<string, (response: Response) => void>();
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("todoi-sync") : null;

const snapshot = () => client ? dehydrate(client, { shouldDehydrateMutation: () => false, shouldDehydrateQuery: (query) => query.state.status === "success" && WORKSPACE_KEYS.has(String(query.queryKey[0])) && queryPath(query.queryKey) !== undefined }) : { queries: [], mutations: [] };
function storageFailure(error: unknown) {
  useSyncState.setState({ storageError: `Couldn't save changes on this device. ${error instanceof Error ? error.message : "Check your browser storage and try again."}` });
}
function adopt(record: LocalWorkspace) {
  workspace = record;
  useSyncState.setState({ ownerId: record.ownerId, user: record.user, operations: record.operations, lastSynced: record.lastSynced });
  for (const [id, resolve] of waiters) {
    const result = record.results?.[id];
    const failed = record.operations.find((op) => op.id === id && op.state === "failed");
    if (result) { resolve(responseFor(result.body, result.status)); waiters.delete(id); }
    else if (failed) { resolve(responseFor(JSON.stringify({ error: failed.error }), failed.status ?? 409, id)); waiters.delete(id); }
  }
}
function broadcast() { channel?.postMessage({ ownerId: workspace?.ownerId }); }
function restoreQueries(record: LocalWorkspace) {
  if (!client) return;
  restoring = true;
  // Device snapshots are immediately usable, but every new page revalidates them against the server.
  hydrate(client, { ...record.queries, queries: record.queries.queries.map((query) => ({ ...query, state: { ...query.state, dataUpdatedAt: 0 } })) });
  restoring = false;
  // Hydration merges snapshots; another tab's purge must also remove data already on screen.
  for (const path of Object.keys(record.denials ?? {})) clearDeniedQueries(record, projectFor(record, path), path);
  projectCachedQueries(record);
}

async function editWorkspace(change: (record: LocalWorkspace) => LocalWorkspace): Promise<LocalWorkspace> {
  const current = workspace;
  if (!current) throw new Error("Open your workspace before saving changes.");
  const record = await updateWorkspace(current.ownerId, (old) => change(old ?? current));
  if (workspace?.ownerId === record.ownerId) adopt(record);
  broadcast();
  return record;
}

export function initializeSync(queryClient: QueryClient) {
  client = queryClient;
  client.getQueryCache().subscribe((event) => {
    if (restoring || !workspace || event.type !== "updated") return;
    clearTimeout(persistTimer);
    const owner = workspace.ownerId;
    persistTimer = setTimeout(() => {
      if (workspace?.ownerId !== owner) return;
      const queries = snapshot();
      void editWorkspace((record) => ({ ...record, queries })).catch(storageFailure);
    }, 30);
  });
  channel?.addEventListener("message", () => {
    const owner = workspace?.ownerId;
    if (!owner || useSyncState.getState().persisting) return;
    void readWorkspace(owner).then((record) => {
      if (!record || workspace?.ownerId !== owner) return;
      adopt(record);
      restoreQueries(record);
      void retrySync();
    }).catch(storageFailure);
  });
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void retrySync());
    window.addEventListener("focus", () => void retrySync());
  }
}

export async function openSyncOwner(user: SessionUser) {
  if (workspace?.ownerId === user.id) return;
  clearTimeout(persistTimer);
  if (workspace) client?.clear();
  const record = await updateWorkspace(user.id, (old) => ({ ...(old ?? { ownerId: user.id, queries: { queries: [], mutations: [] }, operations: [], replies: {}, lastSynced: null }), user }));
  adopt(record);
  restoreQueries(record);
  localStorage.setItem(OWNER_KEY, user.id);
  useSyncState.setState({ storageError: null });
  void retrySync();
}

/** Only a failed network session check can use this; an explicit signed-out answer cannot. */
export async function restoreOfflineOwner(): Promise<boolean> {
  const ownerId = localStorage.getItem(OWNER_KEY);
  if (!ownerId) return false;
  const record = await readWorkspace(ownerId);
  if (!record) return false;
  adopt(record);
  restoreQueries(record);
  return true;
}

export function clearSyncOwner() {
  clearTimeout(persistTimer);
  clearTimeout(timer);
  workspace = undefined;
  client?.clear();
  localStorage.removeItem(OWNER_KEY);
  useSyncState.setState({ ownerId: null, user: null, operations: [], saving: false, lastSynced: null });
}

function responseFor(body: string, status = 200, operationId?: string): Response {
  return new Response(status === 204 ? null : body, { status, headers: { "content-type": "application/json", ...(operationId ? { "x-todoi-local-operation-id": operationId } : {}) } });
}

function queryPath(key: readonly unknown[]): string | undefined {
  const [kind, id, detail] = key;
  if (kind === "me" && (id === undefined || id === "prefs")) return "/api/me";
  if (kind === "groups") return "/api/groups";
  if (kind === "project") return `/api/projects/${id}`;
  if (kind === "labels" || kind === "saved-views") return `/api/${kind}?projectId=${id}`;
  if (kind === "items") {
    const scope = id as { projectId?: string; listId?: string };
    return scope.projectId ? `/api/items?projectId=${scope.projectId}` : scope.listId && scope.listId !== "inbox" ? `/api/items?listId=${scope.listId}` : "/api/items";
  }
  if (kind === "item") return `/api/items/${id}${detail === "details" ? "/details" : ""}`;
  if (kind === "activity") return `/api/activity?projectId=${id}`;
  if (kind === "search") return `/api/search?q=${encodeURIComponent(String(id))}`;
  if (kind === "inbox" && id === "unread") return "/api/inbox/unread";
  if (kind === "archive") return id && id !== "all" ? `/api/archive?projectId=${id}` : "/api/archive";
  return undefined;
}

function projectedData(path: string, body: string, key: readonly unknown[], record: LocalWorkspace): unknown {
  const data = reconcileSnapshot(path, JSON.parse(body), record);
  return key[0] === "me" && key[1] === "prefs" ? (data as { prefs: unknown }).prefs : data;
}

function projectedQueries(record: LocalWorkspace, queries = record.queries) {
  return { ...queries, queries: queries.queries.map((query) => {
    const path = queryPath(query.queryKey);
    const reply = path && record.replies[path];
    return path && reply ? { ...query, state: { ...query.state, data: projectedData(path, reply.body, query.queryKey, record) } } : query;
  }) };
}

const unscopedPrivate = (key: readonly unknown[]) => ["search", "archive", "activity"].includes(String(key[0]));

function provisionalReplies(record: LocalWorkspace, op: SyncOperation): LocalWorkspace["replies"] {
  const body = operationBody(op);
  if (op.path !== "/api/items" || op.method !== "POST" || typeof body.id !== "string") return record.replies;
  const details = `/api/items/${body.id}/details`;
  return { ...record.replies, [details]: record.replies[details] ?? { projectId: projectFor(record, op.path, body), body: JSON.stringify({ labelIds: body.labelIds ?? [], assigneeIds: body.assigneeIds ?? [], watcherIds: [], watching: false, comments: [], relations: [], subitems: [], attachments: [] }) } };
}

function pendingCreation(record: LocalWorkspace, path: string): boolean {
  const itemId = /^\/api\/items\/([^/]+)/.exec(path)?.[1];
  return !!itemId && record.operations.some((op) => op.path === "/api/items" && op.method === "POST" && op.state === "pending" && operationBody(op).id === itemId);
}

function projectCachedQueries(record: LocalWorkspace) {
  if (!client) return;
  restoring = true;
  for (const query of client.getQueryCache().getAll()) {
    const path = queryPath(query.queryKey);
    const reply = path && record.replies[path];
    if (path && reply) client.setQueryData(query.queryKey, projectedData(path, reply.body, query.queryKey, record), { updatedAt: query.state.dataUpdatedAt });
  }
  restoring = false;
}

function clearDeniedQueries(record: LocalWorkspace, projectId: string | undefined, path: string) {
  if (!client) return;
  restoring = true;
  for (const query of client.getQueryCache().getAll()) {
    const mapped = queryPath(query.queryKey);
    if (projectId && unscopedPrivate(query.queryKey) || mapped && (mapped === path || projectId && record.replies[mapped]?.projectId === projectId)) {
      query.setState({ data: undefined, dataUpdatedAt: 0 });
    }
  }
  restoring = false;
}

async function purgeScope(record: LocalWorkspace, projectId: string | undefined, path: string, status = 403) {
  const message = status === 404 ? "This content has been deleted. Your saved change is kept so you can copy it." : "You no longer have access to this project. Your saved change is kept here so you can copy it.";
  const kept = await editWorkspace((latest) => ({ ...latest, denials: { ...latest.denials, ...Object.fromEntries(Object.entries(latest.replies).filter(([key, reply]) => key === path || projectId && reply.projectId === projectId).map(([key]) => [key, { status, message }])), [path]: { status, message } }, replies: Object.fromEntries(Object.entries(latest.replies).filter(([key, reply]) => key !== path && (!projectId || reply.projectId !== projectId && !/^\/api\/(search|archive|activity)/.test(key)))), operations: latest.operations.map((op) => projectId && projectFor(latest, op.path, operationBody(op)) === projectId ? { ...op, state: "failed" as const, status, error: message } : op), queries: { mutations: [], queries: latest.queries.queries.filter((query) => {
    const mapped = queryPath(query.queryKey);
    if (projectId && unscopedPrivate(query.queryKey)) return false;
    return !mapped || mapped !== path && (!projectId || latest.replies[mapped]?.projectId !== projectId);
  }) } }));
  clearDeniedQueries(record, projectId, path);
  return kept;
}

async function readSnapshot(path: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ownerId = workspace?.ownerId;
  if (!ownerId || !queueable(path.split("?")[0]!)) return fetch(input, init);
  const local = await readWorkspace(ownerId) ?? workspace!;
  if (workspace?.ownerId !== ownerId) return fetch(input, init);
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (init?.signal?.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
    const denial = local.denials?.[path];
    if (denial) return responseFor(JSON.stringify({ error: denial.message }), denial.status);
    const reply = local.replies[path];
    if (reply) return responseFor(JSON.stringify(reconcileSnapshot(path, JSON.parse(reply.body), local)));
    throw error;
  }
  if (workspace?.ownerId !== ownerId) throw new DOMException("The workspace changed while loading.", "AbortError");
  // A refusal is authoritative, even if writing the purge to device storage fails.
  if ([401, 403, 404].includes(response.status)) {
    const provisional = local.replies[path];
    if (response.status === 404 && provisional && pendingCreation(local, path)) return responseFor(JSON.stringify(reconcileSnapshot(path, JSON.parse(provisional.body), local)));
    const scope = response.status !== 404 || /^\/api\/projects\/[^/]+$/.test(path) ? projectFor(local, path) : undefined;
    try { await purgeScope(local, scope, path, response.status); }
    catch (error) { storageFailure(error); clearDeniedQueries(local, scope, path); }
    return response;
  }
  if (!response.ok) return response;
  const body = await response.clone().text();
  const value: unknown = JSON.parse(body);
  if (init?.signal?.aborted) throw new DOMException("The snapshot was cancelled.", "AbortError");
  const projectId = projectFor(local, path);
  let record = local;
  try {
    record = await editWorkspace((latest) => {
      // The transaction may have waited behind an acknowledgement that cancelled this read.
      if (init?.signal?.aborted) return latest;
      const { [path]: _denied, ...denials } = latest.denials ?? {};
      return { ...latest, denials, replies: { ...latest.replies, [path]: { body, projectId } } };
    });
  } catch (error) { storageFailure(error); }
  if (init?.signal?.aborted) throw new DOMException("The snapshot was cancelled.", "AbortError");
  if (path === "/api/groups" && Array.isArray(value)) {
    const available = new Set(value.flatMap((group: { projects?: Array<{ id: string }> }) => group.projects?.map((project) => project.id) ?? []));
    const previous = local.replies[path];
    if (previous) {
      const old = JSON.parse(previous.body) as Array<{ projects: Array<{ id: string }> }>;
      for (const project of old.flatMap((group) => group.projects)) if (!available.has(project.id)) {
        // Sidebar absence also means archived/trashed. Only a resource refusal proves access loss.
        const projectPath = `/api/projects/${project.id}`;
        let access: Response;
        try { access = await fetch(projectPath, { signal: init?.signal }); }
        catch { continue; }
        if (![403, 404].includes(access.status)) continue;
        try { record = await purgeScope(record, project.id, projectPath, access.status); }
        catch (error) { storageFailure(error); clearDeniedQueries(local, project.id, projectPath); }
      }
    }
  }
  return responseFor(JSON.stringify(reconcileSnapshot(path, value, record)));
}

/** The RPC boundary owns serializable handlers, so replay never depends on mounted React hooks. */
export async function syncFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  const path = url.pathname + url.search;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET") return readSnapshot(path, input, init);
  if (!workspace || !queueable(url.pathname) || init?.body && typeof init.body !== "string") {
    useSyncState.setState((state) => ({ transientRequests: state.transientRequests + 1 }));
    try { return await fetch(input, init); }
    finally { useSyncState.setState((state) => ({ transientRequests: state.transientRequests - 1 })); }
  }
  const body = typeof init?.body === "string" ? init.body : "";
  // An inline Retry resubmits its saved operation rather than adding a successor behind itself.
  const previous = workspace.operations.find((op) => op.state === "failed" && op.method === method && op.path === path);
  if (previous?.status === 409) return responseFor(JSON.stringify({ error: "This content changed elsewhere. Your draft is saved in Storage & sync; review it before applying your change." }), 409, previous.id);
  const id = previous && previous.body === body ? previous.id : nanoid();
  const draft: SyncOperation = { id, path, method, body, state: "pending", createdAt: new Date().toISOString(), attempts: 0 };
  const resource = resourceFor(path, operationBody(draft));
  const queries = snapshot();
  const result = new Promise<Response>((resolve) => waiters.set(id, resolve));
  useSyncState.setState((state) => ({ persisting: state.persisting + 1 }));
  try {
    const record = await editWorkspace((latest) => {
      const predecessor = latest.operations.findLast((op) => op.resource === resource && resource !== undefined && op.id !== previous?.id);
      const observed = resource ? rowFor(latest, resource)?.version : undefined;
      const version = Math.max(typeof observed === "number" ? observed : 0, resource ? latest.versions?.[resource] ?? 0 : 0);
      const intent = previous?.body === body && previous.reactionActive !== undefined ? previous.reactionActive : reactionIntent({ ...latest, operations: latest.operations.filter((entry) => entry.id !== previous?.id) }, draft);
      const op = { ...draft, resource, reactionActive: intent, baseVersion: typeof version === "number" && version > 0 ? version : undefined, predecessorId: predecessor?.id };
      const operations = previous ? latest.operations.map((entry) => entry.id === previous.id ? { ...op, createdAt: entry.createdAt, baseVersion: entry.baseVersion, predecessorId: entry.predecessorId } : entry.predecessorId === previous.id ? { ...entry, predecessorId: id } : entry) : [...latest.operations, op];
      const next = { ...latest, queries, operations, replies: provisionalReplies(latest, op) };
      return { ...next, queries: projectedQueries(next, queries) };
    });
    projectCachedQueries(record);
    useSyncState.setState({ storageError: null });
    void retrySync();
  } catch (error) {
    waiters.delete(id);
    storageFailure(error);
    throw error;
  } finally { useSyncState.setState((state) => ({ persisting: state.persisting - 1 })); }
  return result;
}

function scheduleRetry(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void retrySync(), delay);
}

async function replay() {
  const ownerId = workspace?.ownerId;
  if (!ownerId || !navigator.onLine) return;
  const queued = await readWorkspace(ownerId);
  if (!queued?.operations.length || queued.operations[0]?.state === "failed") return;
  // Revalidate the actor before every replay pass. Cached offline identity grants no server writes.
  const session = await fetch("/api/auth/get-session", { credentials: "same-origin", signal: AbortSignal.timeout(15_000) });
  if (!session.ok) { scheduleRetry(5000); return; }
  const identity = await session.json() as { user?: { id: string } } | null;
  if (identity?.user?.id !== ownerId) {
    await editWorkspace((record) => ({ ...record, operations: record.operations.map((op) => op.state === "pending" ? { ...op, state: "failed", status: 401, error: "Your session has ended. Sign in to the account that made these changes, then retry." } : op) }));
    return;
  }
  for (;;) {
    const record = await readWorkspace(ownerId);
    if (!record || workspace?.ownerId !== ownerId) return;
    adopt(record);
    const op = record.operations[0];
    if (!op || op.state === "failed") return;
    if (op.nextAttemptAt && op.nextAttemptAt > Date.now()) { scheduleRetry(op.nextAttemptAt - Date.now()); return; }
    useSyncState.setState({ saving: true });
    try {
      const response = await fetch(op.path, { method: op.method, body: op.body || undefined, credentials: "same-origin", headers: { "content-type": "application/json", "X-Todoi-Operation-Id": op.id, "X-Todoi-Owner-Id": ownerId, ...(op.baseVersion !== undefined ? { "X-Todoi-Base-Version": String(op.baseVersion) } : {}) }, signal: AbortSignal.timeout(15_000) });
      const body = await response.text();
      if (workspace?.ownerId !== ownerId) return;
      if ([408, 425, 429].includes(response.status) || response.status >= 500) throw new TypeError("Todoi hasn't confirmed this change yet.");
      if (!response.ok) {
        let detail: { error?: string } = {};
        try { detail = JSON.parse(body) as typeof detail; } catch { /* A proxy refusal may have no JSON body. */ }
        await editWorkspace((latest) => ({ ...latest, operations: latest.operations.map((entry) => entry.id === op.id ? { ...entry, state: "failed", status: response.status, error: detail.error ?? "Couldn't sync this change. Review it and try again." } : entry) }));
        if ([403, 404].includes(response.status)) await purgeScope(record, response.status === 403 ? projectFor(record, op.path, operationBody(op)) : undefined, op.path, response.status);
        return;
      }
      const version = Number(response.headers.get("X-Todoi-Version"));
      let acknowledgedBody = body;
      let affected: Record<string, { before: number; after: number }> = JSON.parse(response.headers.get("X-Todoi-Affected-Versions") ?? "{}");
      if (body) {
        const payload = JSON.parse(body) as Record<string, unknown>;
        if (!Array.isArray(payload) && payload.__syncVersions) {
          const { __syncVersions, ...result } = payload;
          affected = __syncVersions as typeof affected;
          acknowledgedBody = JSON.stringify(result);
        }
      }
      const createdComment = createdCommentVersion(op, acknowledgedBody);
      // A snapshot started before this write may contain older server data. Abort it before
      // dropping the local overlay; the refresh below then starts after the acknowledgment.
      await client?.cancelQueries({ predicate: (query) => queryPath(query.queryKey) !== undefined });
      if (workspace?.ownerId !== ownerId) return;
      const complete = await editWorkspace((latest) => {
        const next: LocalWorkspace = {
          ...latest,
          replies: acknowledgeReplies(latest, op, acknowledgedBody),
          lastSynced: new Date().toISOString(),
          results: { ...Object.fromEntries(Object.entries(latest.results ?? {}).filter(([, result]) => result.at > Date.now() - 86_400_000)), [op.id]: { body: acknowledgedBody, status: response.status, at: Date.now() } },
          versions: { ...latest.versions, ...Object.fromEntries(Object.entries(affected).map(([resource, change]) => [resource, change.after])), ...(op.resource && version > 0 ? { [op.resource]: version } : {}), ...(createdComment ? { [createdComment.resource]: createdComment.version } : {}) },
          operations: latest.operations.filter((entry) => entry.id !== op.id).map((entry) => {
            if (entry.predecessorId === op.id) return { ...entry, predecessorId: undefined, ...(version > 0 ? { baseVersion: version } : {}) };
            if (createdComment && entry.resource === createdComment.resource && entry.baseVersion === undefined) return { ...entry, baseVersion: createdComment.version };
            const change = entry.resource && affected[entry.resource];
            return change && entry.baseVersion === change.before ? { ...entry, baseVersion: change.after } : entry;
          }),
        };
        return { ...next, queries: projectedQueries(next) };
      });
      // Live hooks perform their normal invalidations; restored operations have no mounted handler.
      if (!complete.operations.length) void client?.invalidateQueries();
    } catch (error) {
      if (workspace?.ownerId !== ownerId) return;
      if (!(error instanceof TypeError) && !(error instanceof DOMException)) { storageFailure(error); return; }
      const attempts = op.attempts + 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 5));
      await editWorkspace((latest) => ({ ...latest, operations: latest.operations.map((entry) => entry.id === op.id ? { ...entry, attempts, nextAttemptAt: Date.now() + delay } : entry) }));
      scheduleRetry(delay);
      return;
    } finally { useSyncState.setState({ saving: false }); }
  }
}

export function retrySync(): Promise<void> {
  drain ??= (async () => {
    const owner = workspace?.ownerId;
    if (!owner) return;
    if (navigator.locks) await navigator.locks.request(`todoi-replay:${owner}`, { ifAvailable: true }, (lock) => lock ? replay() : Promise.resolve());
    else await replay(); // Receipts still deduplicate retries in browsers without Web Locks.
  })().catch((error: unknown) => {
    if (error instanceof TypeError || error instanceof DOMException) scheduleRetry(5000);
    else storageFailure(error);
  }).finally(() => {
    drain = undefined;
    const first = workspace?.operations[0];
    if (navigator.onLine && first?.state === "pending" && !first.nextAttemptAt) scheduleRetry(0);
  });
  return drain;
}

export async function retryOperation(id: string, overwrite = false): Promise<void> {
  let replacement = id;
  await editWorkspace((record) => ({ ...record, operations: record.operations.map((op) => {
    if (op.id !== id) return op;
    // A conflict is a new user decision; it must not change the fingerprint of an old receipt.
    replacement = overwrite ? nanoid() : id;
    return { ...op, id: replacement, state: "pending" as const, error: undefined, status: undefined, nextAttemptAt: undefined, ...(overwrite ? { baseVersion: undefined } : {}) };
  }).map((op) => op.predecessorId === id && replacement !== id ? { ...op, predecessorId: replacement } : op) }));
  if (replacement !== id) {
    const waiter = waiters.get(id);
    if (waiter) { waiters.set(replacement, waiter); waiters.delete(id); }
  }
  await retrySync();
}

export async function discardOperation(id: string): Promise<void> {
  await drain;
  if (!workspace?.operations.some((op) => op.id === id)) return;
  const record = await editWorkspace((latest) => ({ ...latest, operations: latest.operations.filter((op) => op.id !== id).map((op) => op.predecessorId === id ? { ...op, predecessorId: undefined } : op) }));
  waiters.get(id)?.(responseFor(JSON.stringify({ error: "You discarded this local change." }), 409));
  waiters.delete(id);
  projectCachedQueries(record);
  void client?.invalidateQueries();
  await retrySync();
}

export async function discardPendingSync(): Promise<void> {
  const ids = useSyncState.getState().operations.filter((op) => op.state === "pending").map((op) => op.id);
  for (const id of ids) await discardOperation(id);
}
