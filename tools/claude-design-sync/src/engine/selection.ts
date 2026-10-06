// Shared by the run review and execution so they agree about the upload that accompanies Design work.
import type { Step } from "./plan";

export function stepsForSelection(steps: Step[], only?: string[]): Step[] {
  if (!only?.length) return steps;
  const selected = new Set(only);
  const designWork = steps.some((s) => selected.has(s.id) && s.target === "design");
  return steps.filter((s) => selected.has(s.id) || (s.kind === "upload" && designWork));
}
