import type { DehydratedState } from "@tanstack/react-query";
import type { SessionUser } from "../auth";

export interface SyncOperation {
  id: string;
  method: string;
  path: string;
  body: string;
  state: "pending" | "failed";
  createdAt: string;
  resource?: string;
  baseVersion?: number;
  predecessorId?: string;
  error?: string;
  status?: number;
  attempts: number;
  nextAttemptAt?: number;
  /** Desired local reaction state; the original toggle request body remains unchanged for replay. */
  reactionActive?: boolean;
}

export interface CachedReply {
  body: string;
  projectId?: string;
}

export interface LocalWorkspace {
  ownerId: string;
  user: SessionUser;
  queries: DehydratedState;
  replies: Record<string, CachedReply>;
  operations: SyncOperation[];
  versions?: Record<string, number>;
  results?: Record<string, { body: string; status: number; at: number }>;
  denials?: Record<string, { status: number; message: string }>;
  lastSynced: string | null;
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("todoi-sync", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspaces", { keyPath: "ownerId" });
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => {
      blocked = true;
      database = undefined;
      reject(new Error("Close other Todoi tabs to update device storage."));
    };
  });
  return database;
}

export async function readWorkspace(ownerId: string): Promise<LocalWorkspace | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", "readonly");
    const request = tx.objectStore("workspaces").get(ownerId);
    request.onsuccess = () => resolve(request.result as LocalWorkspace | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Read/modify/write in one transaction: tabs cannot lose each other's queued operations. */
export async function updateWorkspace(ownerId: string, change: (current: LocalWorkspace | undefined) => LocalWorkspace): Promise<LocalWorkspace> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", "readwrite", { durability: "strict" });
    const store = tx.objectStore("workspaces");
    let result: LocalWorkspace;
    const request = store.get(ownerId);
    request.onsuccess = () => {
      try {
        result = change(request.result as LocalWorkspace | undefined);
        store.put(result);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Couldn't save your changes on this device."));
  });
}
