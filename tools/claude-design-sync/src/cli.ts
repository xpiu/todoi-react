// Command line for the engine — the same operations the GUI offers, for scripts and for an AI harness.
//   npm run design-sync -- serve | pull [--force] | status | import <zip|folder> | compare [--base <id>] | sync-point <label> [--tag]
//   npm run design-sync -- twin <card.html> [out] | bundle <projectDir> | check-cards <projectDir> <card…>
import { defaultCtx } from "./engine/config";
import { compare } from "./engine/compare";
import { projectStatus, pullIfChanged } from "./engine/designsync";
import { runHarness } from "./engine/harness";
import { recordSyncPoint } from "./engine/plan";
import { importExport, latestSnapshot, listSyncPoints } from "./engine/snapshots";
import { buildBundle, checkCards, writeTwin } from "./engine/kit";

const ctx = defaultCtx();
const [cmd, ...args] = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const claude = (prompt: string, o: { model?: string; maxTurns?: number }, on: Parameters<typeof runHarness>[1]) =>
  runHarness({ kind: "claude", bin: ctx.config.harness.claudeBin, cwd: ctx.repo, prompt, model: o.model, maxTurns: o.maxTurns, allowedTools: ["DesignSync", "ToolSearch"] }, on);

async function main() {
  switch (cmd) {
    case "serve": {
      await import("./server/main");
      return;
    }
    case "status": {
      console.log(await projectStatus(ctx, claude));
      return;
    }
    case "pull": {
      const { snapshot: snap, current } = await pullIfChanged(ctx, claude, { force: args.includes("--force"), onProgress: (p) => process.stdout.write(`\r${p.done}/${p.total} files${p.failed.length ? ` · ${p.failed.length} failed` : ""}   `) });
      if (!snap) {
        console.log(`Already up to date: Claude Design hasn't changed since ${current?.label}. Nothing pulled (--force pulls anyway).`);
        return;
      }
      console.log(`\nSnapshot ${snap.id}: ${snap.fileCount} files`);
      if (snap.unpulled) console.log(`Not pulled: ${[...snap.unpulled.carried, ...snap.unpulled.missing].join(", ")}${snap.unpulled.carried.length ? ` (${snap.unpulled.carried.length} kept as in ${snap.unpulled.from})` : ""}. Pull again.`);
      return;
    }
    case "import": {
      const snap = importExport(ctx, args[0]!, flag("--label"));
      console.log(`Snapshot ${snap.id}: ${snap.fileCount} files`);
      return;
    }
    case "compare": {
      const points = listSyncPoints(ctx);
      const base = (flag("--base") ? points.find((p) => p.id === flag("--base")) : points[0]) ?? null;
      const c = compare(ctx, { base });
      console.log(`Base: ${base?.label ?? "none"} · Design: ${c.designSnapshot?.label ?? "no snapshot"}`);
      for (const f of c.features) console.log(`${f.status.padEnd(13)} ${f.title}  (${f.units.map((u) => u.name).join(", ")})`);
      return;
    }
    case "sync-point": {
      const snap = latestSnapshot(ctx);
      const p = recordSyncPoint(ctx, { label: args[0] ?? "Sync point", snapshotId: snap?.id ?? null, tag: args.includes("--tag") });
      console.log(p);
      return;
    }
    case "twin": {
      console.log(writeTwin(args[0]!, args[1]));
      return;
    }
    case "bundle": {
      console.log(await buildBundle(args[0]!));
      return;
    }
    case "check-cards": {
      const res = await checkCards(args[0]!, args.slice(1));
      for (const r of res) console.log(r.errors.length ? `✘ ${r.card}\n    ${r.errors.join("\n    ")}` : `✓ ${r.card}`);
      process.exitCode = res.some((r) => r.errors.length) ? 1 : 0;
      return;
    }
    default:
      console.log("Commands: serve · status · pull [--force] · import <zip|folder> · compare [--base <id>] · sync-point <label> [--tag] · twin <card> [out] · bundle <dir> · check-cards <dir> <cards…>");
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
