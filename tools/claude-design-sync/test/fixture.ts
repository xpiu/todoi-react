// A throwaway world for tests: an App git repo (sync-point tag + two later commits) and two Design
// project folders (as at the sync point, and now). Nothing touches the real repo or state.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { loadConfig, TOOL_DIR, type Ctx } from "../src/engine/config";
import { importExport, saveSyncPoint } from "../src/engine/snapshots";

const write = (root: string, files: Record<string, string>) => {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
};
const git = (repo: string, ...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });

const CARD = (name: string, uses: string) => `<!-- @dsCard group="Components" viewport="400x200" name="${name}" subtitle="A test card" -->
<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../../styles.css">
<style>.row{border-radius:var(--radius-lg,7px);box-shadow:var(--shadow-card)}</style></head>
<body><div id="root"></div><script type="text/babel">
const {${uses}}=window.FlowboardDesignSystem_13419b;
</script></body></html>
`;

export const DESIGN_BASE: Record<string, string> = {
  "styles.css": '@import "tokens/themes/minimal-components.css";\n',
  "_ds_manifest.json": JSON.stringify({ namespace: "FlowboardDesignSystem_13419b", components: [] }),
  "components/board/BoardView.jsx": 'import React from "react";\nexport function BoardView({children,onAddList}){return React.createElement("div",null,children);}\n',
  "components/board/BoardView.d.ts": "export interface BoardViewProps {\n  children?: React.ReactNode;\n  onAddList?: () => void;\n}\n",
  "components/board/board.card.html": CARD("Board", "BoardView"),
  "components/core/Toast.jsx": 'import React from "react";\nexport function Toast({message}){return React.createElement("div",null,message);}\n',
  "components/core/Badge.jsx": 'import React from "react";\nexport function Badge({n}){return React.createElement("b",null,n);}\n',
  "tokens/themes/minimal-components.css": 'html[data-theme="minimal"] .td-a{color:red}\nhtml[data-theme="minimal"] .td-b{color:blue}\n',
  "readme.md": "# Kit\n\n## Board\n\nBoards show lists.\n\n## Toasts\n\nToasts confirm.\n",
};

export const DESIGN_NOW: Record<string, string> = {
  ...DESIGN_BASE,
  "components/board/BoardView.d.ts": "export interface BoardViewProps {\n  children?: React.ReactNode;\n  onAddList?: () => void;\n  dense?: boolean;\n}\n",
  "components/core/Chip.jsx": 'import React from "react";\nexport function Chip({label}){return React.createElement("span",null,label);}\n',
  "components/core/chip.card.html": CARD("Chips", "Chip"),
  "components/board/board-minimal.card.html": CARD("Board · Minimal", "BoardView"),
  "tokens/themes/minimal-components.css": 'html[data-theme="minimal"] .td-a{color:red}\nhtml[data-theme="minimal"] .td-b{color:blue}\nhtml[data-theme="minimal"] .td-chip{border:0}\n',
  "readme.md": "# Kit\n\n## Board\n\nBoards show lists and dense mode.\n\n## Toasts\n\nToasts confirm.\n",
};

const APP_BASE: Record<string, string> = {
  "src/client/design/board/BoardView.tsx": "export interface BoardViewProps {\n  children?: unknown;\n  onAddList?: () => void;\n}\nexport function BoardView(p: BoardViewProps) { return p.children; }\n",
  "src/client/design/board/BoardView.css": ".td-board{display:flex}\n",
  "src/client/design/core/Toast.tsx": "export function Toast({ message }: { message: string }) { return message; }\n",
  "src/client/design/core/Badge.tsx": "export function Badge({ n }: { n: number }) { return n; }\n",
  "src/client/design/tokens/themes/minimal-components.css": 'html[data-theme="minimal"] .td-a{color:red}\nhtml[data-theme="minimal"] .td-b{color:blue}\n',
  "DESIGN.md": "# Spec\n\n## Board\n\nBoards show lists.\n\n## Toasts\n\nToasts confirm.\n",
};

export interface Fixture {
  ctx: Ctx;
  repo: string;
  designNowDir: string;
  baseSnapshot: string;
  nowSnapshot: string;
}

export function makeFixture(root = mkdtempSync(join(tmpdir(), "cds-fixture-"))): Fixture {
  const repo = join(root, "repo");
  const state = join(root, "state");
  const designBaseDir = join(root, "design-base");
  const designNowDir = join(root, "design-now");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  write(repo, APP_BASE);
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "chore: start");
  git(repo, "tag", "-a", "design-sync/2026-01-01", "-m", "sync");
  const rev = git(repo, "rev-parse", "--short", "HEAD").trim();
  write(repo, {
    "src/client/design/board/HiddenListsMenu.tsx": "export function HiddenListsMenu() { return null; }\n",
    "src/client/design/board/BoardView.tsx": "export interface BoardViewProps {\n  children?: unknown;\n  onAddList?: () => void;\n  after?: unknown;\n}\nexport function BoardView(p: BoardViewProps) { return p.children; }\n",
  });
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "fix: recover hidden lists");
  write(repo, {
    "src/client/design/core/Toast.tsx": "export function Toast({ message }: { message: string }) { return `!${message}`; }\n",
    "src/client/design/tokens/themes/minimal-components.css": 'html[data-theme="minimal"] .td-a{color:red}\nhtml[data-theme="minimal"] .td-hidden{opacity:.5}\nhtml[data-theme="minimal"] .td-b{color:blue}\n',
  });
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "feat: retryable toast");
  write(designBaseDir, DESIGN_BASE);
  write(designNowDir, DESIGN_NOW);
  const config = { ...loadConfig(join(TOOL_DIR, "config.json")), renames: [], screens: [] };
  config.design = { ...config.design, projectId: "fake" };
  // the fixture repo has no package.json: its "check" just confirms the branch has a commit to merge
  config.app = { ...config.app, check: "git log -1 --format=%s" };
  const ctx: Ctx = { repo, state, config };
  const base = importExport(ctx, designBaseDir, "Design at the sync point");
  // ids are second-resolution timestamps: make sure the "now" snapshot sorts after the base
  const now = { ...importExport(ctx, designNowDir, "Design now") };
  saveSyncPoint(ctx, { id: "design-sync/2026-01-01", label: "Start", rev, designSnapshot: base.id, createdAt: "2026-01-01T00:00:00.000Z" });
  writeFileSync(join(root, "config.json"), JSON.stringify(config, null, 2));
  return { ctx, repo, designNowDir, baseSnapshot: base.id, nowSnapshot: now.id };
}
