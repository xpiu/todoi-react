import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Icon, type IconName } from "./Icon";
import { LUCIDE_ICONS } from "./icons";

const CUSTOM: IconName[] = ["circle-todo", "list-thin", "sparkle", "x-logo", "github", "discord"];
// Drawn per theme: Ledger glyphs in Minimal, pixel-snapped in Rounded.
const THEMED: IconName[] = ["list", "kanban", "calendar", "panel-right", "panel-left"];

function Grid({ names, size }: { names: ReadonlyArray<IconName>; size?: number }) {
  return (
    <ul style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "var(--sp-2)", listStyle: "none", margin: 0, padding: 0 }}>
      {names.map((n) => (
        <li key={n} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", font: "var(--type-small)" }}>
          <Icon name={n} size={size} />
          {n}
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: "Core/Icon",
  component: Icon,
  args: { name: "inbox", size: 16 },
  parameters: { docs: { description: { component: "The one glyph API: Lucide through the explicit map in icons.ts plus Todoi's own glyphs. Always decorative (aria-hidden); the surrounding control carries the accessible name. Use 16px for badges and meta, 20px for section headers. List, kanban, calendar and panel glyphs redraw per theme, so read the name from the map rather than importing Lucide directly." } } },
} satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ canvasElement }) {
    const svg = canvasElement.querySelector("svg")!;
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    await expect(svg).toHaveAttribute("width", "16");
  },
};
export const Large: Story = { args: { name: "calendar", size: 20 } };
export const Colored: Story = { args: { name: "circle-check", color: "var(--success-icon)" } };
export const ThemedGlyphs: Story = { render: (args) => <Grid names={THEMED} size={args.size} /> };
export const CustomGlyphs: Story = { render: (args) => <Grid names={CUSTOM} size={args.size} /> };
export const Catalogue: Story = { render: (args) => <Grid names={Object.keys(LUCIDE_ICONS) as IconName[]} size={args.size} /> };
