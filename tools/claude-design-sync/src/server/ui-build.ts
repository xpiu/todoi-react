// Bundles the GUI (React 19 + plain CSS) into dist/ with esbuild — on server start, in well under a second.
import { join } from "node:path";

import { TOOL_DIR } from "../engine/config";

export async function buildUi(): Promise<void> {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [join(TOOL_DIR, "src/ui/main.tsx")],
    bundle: true,
    format: "esm",
    outdir: join(TOOL_DIR, "dist"),
    entryNames: "app",
    jsx: "automatic",
    minify: process.env.NODE_ENV === "production",
    sourcemap: true,
    target: "es2022",
    define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development") },
    logLevel: "warning",
  });
}
