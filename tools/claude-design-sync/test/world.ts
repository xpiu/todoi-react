// A fixture world and server of its own, so a spec that runs jobs never changes what the shared suite sees.
// `fake` tunes the stand-in harness (how long each Claude Code call takes, what it reports spending).
import { serve } from "@hono/node-server";
import { rmSync } from "node:fs";
import { dirname } from "node:path";

import { createApp } from "../src/server/main";
import { makeFixture } from "./fixture";

export async function ownWorld(fake: { delayMs?: number; costUsd?: number } = {}) {
  const fx = makeFixture();
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir, ...fake } });
  const { server, url } = await new Promise<{ server: ReturnType<typeof serve>; url: string }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => resolve({ server: s, url: `http://127.0.0.1:${info.port}` }));
  });
  return {
    fx,
    url,
    close: async () => {
      if ("closeAllConnections" in server) server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dirname(fx.repo), { recursive: true, force: true });
    },
  };
}
