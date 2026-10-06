// Runtime validation for the local API. Reuse the application's Hono/Zod validator.
import { z } from "zod";

export { validate } from "../../../../src/server/errors";

const id = z.string().regex(/^[A-Za-z0-9_-]+$/, "Invalid snapshot or job id");
const base = z.string().min(1).nullish();
const direction = z.enum(["both", "app-to-design", "design-to-app", "skip"]);
const directions = z.record(z.string(), direction);

export const comparisonQuery = z.object({ base, snapshot: id.optional(), fresh: z.enum(["0", "1"]).optional() });
export const mappingQuery = comparisonQuery.pick({ base: true });
export const diffQuery = comparisonQuery.omit({ fresh: true }).extend({ unit: z.string().min(1), side: z.enum(["app", "design"]).default("app") });
export const planRequest = z.object({
  base, snapshot: id.optional(), global: direction, overrides: directions,
  unitOverrides: directions.optional(),
});
export const runRequest = planRequest.extend({ only: z.array(z.string().min(1)).optional() });
export type PlanRequest = z.infer<typeof planRequest>;

export const projectRequest = z.object({ project: z.string() });
export const pullRequest = z.object({ force: z.boolean().optional() });
export const importRequest = z.object({ path: z.string().min(1), label: z.string().optional() });
export const syncPointRequest = z.object({
  label: z.string().min(1), tag: z.boolean().optional(), snapshot: id.optional(), base,
  hold: z.array(z.string().min(1)).optional(),
});
export const uploadRequest = z.object({ paths: z.array(z.string().min(1)).min(1, "Pick at least one staged file") });
export const jobParam = z.object({ id });
export const kitParam = z.object({ where: z.enum(["stage", "snapshot"]), id });
