// Priority flags: the colour each level's flag takes (label tokens), shared by cards, rows and the quick-add preview.
import type { QuickAddPriority } from "./quickAdd";

export const PRIORITY_COLORS: Readonly<Record<QuickAddPriority, string>> = { Urgent: "var(--label-red)", High: "var(--label-orange)", Medium: "var(--label-yellow)", Low: "var(--label-blue)" };
