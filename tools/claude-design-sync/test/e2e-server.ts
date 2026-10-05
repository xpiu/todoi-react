// Playwright's web server: a fresh fixture world + the tool with the fake harness on :4478.
// Also a demo (npm run design-sync:demo): nothing touches the real repo, state or Claude Design.
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeFixture } from "./fixture";

const root = join(tmpdir(), "cds-e2e");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const fx = makeFixture(root);
process.env.CDS_REPO = fx.repo;
process.env.CDS_STATE = fx.ctx.state;
process.env.CDS_CONFIG = join(root, "config.json");
process.env.CDS_FAKE_HARNESS = "1";
process.env.CDS_FAKE_DESIGN = fx.designNowDir;
process.env.CDS_PORT = "4478";
process.argv[1] = "main.ts";
await import("../src/server/main");
