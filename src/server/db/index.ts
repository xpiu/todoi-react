import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "../env";
import * as schema from "./schema";

const connection = drizzle(env.DATABASE_URL, { schema });
type Transaction = Parameters<Parameters<typeof connection.transaction>[0]>[0];
interface TransactionContext { transaction: Transaction; afterCommit: Array<() => Promise<unknown>> }
const context = new AsyncLocalStorage<TransactionContext>();

/** Existing services automatically use the request transaction; nested transactions remain savepoints. */
export const db: typeof connection = new Proxy(connection, {
  get(target, property) {
    const active = context.getStore();
    if (property === "transaction" && active) {
      return (run: (tx: Transaction) => Promise<unknown>) => active.transaction.transaction((tx) =>
        context.run({ ...active, transaction: tx }, () => run(tx)));
    }
    const source = active && property !== "$client" ? active.transaction : target;
    const value = Reflect.get(source, property);
    return typeof value === "function" ? value.bind(source) : value;
  },
});

export const inRequestTransaction = () => context.getStore() !== undefined;

/** Keep external effects (attachment file cleanup) outside a transaction that may still roll back. */
export function afterCommit(run: () => Promise<unknown>) {
  const active = context.getStore();
  if (active) { active.afterCommit.push(run); return Promise.resolve(); }
  return run();
}

export async function requestTransaction<T>(run: () => Promise<T>): Promise<T> {
  const pending: TransactionContext["afterCommit"] = [];
  const result = await connection.transaction((transaction) => context.run({ transaction, afterCommit: pending }, run));
  for (const effect of pending) await effect();
  return result;
}
