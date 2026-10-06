// Favicons, one per theme × mode (spec: DESIGN.md › Iconography — a lowercase t in the theme's face,
// 64px PNGs in public/favicon/). index.html ships a static `<link rel="icon" data-td-favicon>` and
// its pre-paint script points it at the stored theme × mode; the appearance store calls
// applyFavicon whenever it applies theme or mode, so the tab icon follows the Style menu.
import type { ModeId, ThemeId } from "./themes";

export const FAVICONS: Record<`${ThemeId}-${ModeId}`, string> = {
  "minimal-light": "/favicon/minimal-light.png",
  "minimal-dark": "/favicon/minimal-dark.png",
  "rounded-light": "/favicon/rounded-light.png",
  "rounded-dark": "/favicon/rounded-dark.png",
};

export const faviconFor = (theme: ThemeId, mode: ModeId) => FAVICONS[`${theme}-${mode}`];

export function applyFavicon(theme: ThemeId, mode: ModeId) {
  if (typeof document === "undefined") return;
  const href = faviconFor(theme, mode);
  let link = document.querySelector<HTMLLinkElement>("link[data-td-favicon]");
  if (!link) {
    document.querySelectorAll('link[rel~="icon"]').forEach((n) => n.remove());
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.setAttribute("data-td-favicon", "");
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}
