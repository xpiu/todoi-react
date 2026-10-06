import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { faviconFor } from "./favicon";
import { MODE_IDS, THEME_IDS } from "./themes";

describe("favicons", () => {
  it("ships a public PNG for every theme × mode", () => {
    for (const theme of THEME_IDS) {
      for (const mode of MODE_IDS) {
        const href = faviconFor(theme, mode);
        expect(href).toBe(`/favicon/${theme}-${mode}.png`);
        expect(existsSync(new URL(`../../../../public${href}`, import.meta.url))).toBe(true);
      }
    }
  });
});
