import type { Decorator, Preview } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { expect } from "storybook/test";

import { useAppearanceStore } from "../src/client/design/core/appearance";
import { DEFAULT_MODE, DEFAULT_THEME, MODES, THEMES, isMode, isTheme } from "../src/client/design/core/themes";
import { useViewport } from "../src/client/design/core/viewport";
import "../src/client/design/index.css";
import "./preview.css";

const withAppearance: Decorator = (Story, context) => {
  const theme = isTheme(context.globals.theme) ? context.globals.theme : DEFAULT_THEME;
  const mode = isMode(context.globals.mode) ? context.globals.mode : DEFAULT_MODE;
  // Keep CSS attributes and responsive hooks on the application's actual media-query logic.
  useViewport();
  useLayoutEffect(() => {
    useAppearanceStore.getState().set({ theme, mode });
  }, [theme, mode]);
  return <main aria-label="Component preview"><Story /></main>;
};

const preview: Preview = {
  tags: ["autodocs"],
  globalTypes: {
    theme: { description: "Application theme", toolbar: { title: "Theme", dynamicTitle: true, items: THEMES.map((t) => ({ value: t.id, title: t.label })) } },
    mode: { description: "Application color mode", toolbar: { title: "Mode", dynamicTitle: true, items: MODES.map((m) => ({ value: m.id, title: m.label })) } },
  },
  initialGlobals: { theme: DEFAULT_THEME, mode: DEFAULT_MODE },
  decorators: [withAppearance],
  parameters: {
    layout: "padded",
    backgrounds: { disable: true },
    // Match the existing application axe gate. Theme contrast remediation remains follow-up work.
    a11y: { test: "error", context: "body", config: { rules: [{ id: "color-contrast", enabled: false }] } },
    viewport: {
      options: {
        desktop: { name: "Desktop", styles: { width: "1280px", height: "800px" }, type: "desktop" },
        tablet: { name: "Tablet", styles: { width: "820px", height: "1180px" }, type: "tablet" },
        phone: { name: "Phone", styles: { width: "390px", height: "844px" }, type: "mobile" },
      },
    },
  },
  beforeEach() {
    useAppearanceStore.getState().reset();
    return () => useAppearanceStore.getState().reset();
  },
  async afterEach({ globals, canvasElement }) {
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root).toHaveAttribute("data-theme", globals.theme);
    await expect(root).toHaveAttribute("data-mode", globals.mode);
  },
};

export default preview;
