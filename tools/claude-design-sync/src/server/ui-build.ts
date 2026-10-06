// Bundles the GUI (React 19 + plain CSS) into dist/ with esbuild — on server start, in well under a second.
import { join } from "node:path";

import { TOOL_DIR } from "../engine/config";

/** Where the GUI bundle goes: CDS_DIST lets a test or demo server bundle beside a running one without swapping its UI */
export const distDir = () => process.env.CDS_DIST ?? join(TOOL_DIR, "dist");

export async function buildUi(): Promise<void> {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [join(TOOL_DIR, "src/ui/main.tsx")],
    bundle: true,
    format: "esm",
    outdir: distDir(),
    entryNames: "app",
    jsx: "automatic",
    minify: process.env.NODE_ENV === "production",
    sourcemap: true,
    target: "es2022",
    define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development") },
    logLevel: "warning",
  });
}
