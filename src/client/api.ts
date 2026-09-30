import { hc } from "hono/client";

// Type-only import: nothing from the server ends up in the browser bundle.
import type { AppType } from "../server/app";

// Same-origin in dev thanks to the Vite proxy; the built app is served next to the API later.
export const api = hc<AppType>("/");
