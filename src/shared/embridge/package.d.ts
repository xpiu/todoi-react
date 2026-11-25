// The reference parser ships as CommonJS without types; this is its public surface (src/index.js).
declare module "embridge" {
  export function parseEmbridge(markdown: string, options?: { mode?: "marker" | "blank-lines" }): import("./types").EmbridgeDocument;
}
