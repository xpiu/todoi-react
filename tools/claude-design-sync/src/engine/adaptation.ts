// A feature's translation decisions travel with the job, including across directions and restarts.
import { z } from "zod";

export const ADAPTATION_MARKER = "CDS_ADAPTATION=";
const text = z.string().trim().min(1);
const verification = z.object({
  status: z.enum(["passed", "not-applicable", "blocked"]),
  evidence: text,
});
const report = z.object({
  units: z.array(z.object({
    id: text,
    intent: text,
    differences: text,
    implementation: text,
    tradeoffs: text,
    interaction: verification,
    appearance: verification,
  })).min(1),
});
export type Adaptation = z.infer<typeof report>;

export function readAdaptation(result: string, units: string[]): Adaptation {
  const lines = result.split("\n").filter((line) => line.startsWith(ADAPTATION_MARKER));
  if (lines.length !== 1) throw new Error("Expected one CDS_ADAPTATION report; the feature's translation is unverified");
  let value: unknown;
  try {
    value = JSON.parse(lines[0]!.slice(ADAPTATION_MARKER.length));
  } catch (e) {
    throw new Error(`Invalid CDS_ADAPTATION JSON: ${(e as Error).message}. Put every selected part inside the single units array and serialize the complete report with JSON.stringify.`, { cause: e });
  }
  const parsed = report.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".") || "report"}: ${issue.message}`).join("; ");
    throw new Error(`Invalid CDS_ADAPTATION report: ${details}`);
  }
  const adaptation = parsed.data;
  const ids = new Set(adaptation.units.map((u) => u.id));
  if (ids.size !== adaptation.units.length || ids.size !== units.length || units.some((id) => !ids.has(id))) {
    throw new Error("The adaptation report must cover exactly every selected subfeature once");
  }
  return adaptation;
}

/** The AI reported a check it couldn't run or intent it couldn't reconcile: another attempt wouldn't change that */
export class BlockedAdaptation extends Error {}

export function blockedAdaptation(adaptation: Adaptation): string | undefined {
  const blocked = adaptation.units.flatMap((u) => (["interaction", "appearance"] as const).flatMap((kind) => {
    const check = u[kind];
    return check.status === "blocked" ? [`${u.id} ${kind}: ${check.evidence}`] : [];
  }));
  return blocked.length ? `Fidelity verification is incomplete: ${blocked.join("; ")}` : undefined;
}

export const ADAPTATION_BRIEF = `## Adaptation workflow
1. Before editing, inspect both environments and state a short plan in your response: the intended user behavior, runtime/API/state differences, and the destination implementation you chose. Consider alternatives only where there is a meaningful tradeoff. This is a translation of behavior, not a requirement to reproduce source code or component structure.
2. Reuse the destination's existing primitives and patterns. You may adapt composition, APIs and preview scaffolding to preserve behavior. Production architecture takes priority. Preserve receiving-side changes; resolve conflicting intent explicitly rather than silently picking one side. If the intended behavior cannot be reconciled, report the conflict as blocked.
3. Implement, then verify interaction and appearance separately. Exercise relevant keyboard/focus/dismissal, callbacks, controlled state and independent instances in the destination. Check Rounded/Minimal and light/dark appearance for visual changes. Use the existing browser/Storybook/card tooling and focused tests as appropriate. A successful bundle, typecheck or screenshot alone does not prove interaction fidelity.
4. Finish with one line ${ADAPTATION_MARKER}{"units":[{"id":"<exact subfeature id>","intent":"<user behavior to preserve>","differences":"<relevant environment differences>","implementation":"<chosen destination solution>","tradeoffs":"<meaningful tradeoffs, or none and why>","interaction":{"status":"passed|not-applicable|blocked","evidence":"<executed checks and observed outcomes, or reason>"},"appearance":{"status":"passed|not-applicable|blocked","evidence":"<executed checks and observed outcomes, or reason>"}}]}. Build the complete report as one object and use JSON.stringify to serialize it; all unit objects belong in the same units array. Check that the emitted JSON parses before finishing. Include exactly every selected subfeature once. Use not-applicable only when that dimension is unaffected (e.g. a documentation-only change), with a specific reason. Checks you could not execute are blocked, never passed. Report decisions and observable evidence, not private reasoning. The tool validates coverage and blocks acceptance of incomplete verification; the developer still reviews the evidence.`;
