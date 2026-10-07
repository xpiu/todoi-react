// ExportMenu — export an item or a view: PDF · Markdown · CSV rows with the extension as a mono
// trail, one summary note, an optional Print row. Menu rows, so it lives inside an existing menu
// (a ⋯ drill view) or behind ExportButton. Spec: DESIGN.md › Export & print.
import { Menu as BaseMenu } from "@base-ui/react/menu";

import type { IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { MenuButton, MenuDivider, MenuGroup, MenuItem, MenuNote } from "./Menu";
import "./ProjectPicker.css";
import "./ExportMenu.css";

export type ExportFormatId = "pdf" | "md" | "csv";
export interface ExportFormat {
  id: ExportFormatId;
  label: string;
  ext: string;
  icon: IconName;
  hint: string;
}
export const EXPORT_FORMATS: ReadonlyArray<ExportFormat> = [
  { id: "pdf", label: "PDF", ext: ".pdf", icon: "file-text", hint: "Laid out as shown — for print and sharing" },
  { id: "md", label: "Markdown", ext: ".md", icon: "file-code-2", hint: "Embridge format — imports back into Todoi" },
  { id: "csv", label: "CSV", ext: ".csv", icon: "table", hint: "One row per item — for spreadsheets" },
];

/** "This view · 7 items · filters applied" / "This item · 3 subitems · comments included" */
export function exportSummary({ scope = "view", count, filtered, view, subitems, comments }: { scope?: "item" | "view"; count?: number; filtered?: boolean; view?: string; subitems?: number; comments?: boolean }): string {
  const parts = [scope === "item" ? "This item" : view ? `This ${view.toLowerCase()} view` : "This view"];
  if (scope === "item") {
    if (subitems) parts.push(`${subitems} subitem${subitems === 1 ? "" : "s"}`);
    if (comments) parts.push("comments included");
  } else {
    if (count != null) parts.push(`${count} item${count === 1 ? "" : "s"}`);
    if (filtered) parts.push("filters applied");
  }
  return parts.join(" · ");
}

export interface ExportMenuProps {
  scope?: "item" | "view";
  count?: number;
  filtered?: boolean;
  view?: string;
  subitems?: number;
  comments?: boolean;
  summary?: string;
  formats?: ReadonlyArray<ExportFormat>;
  onExport: (format: ExportFormatId) => void;
  onPrint?: () => void;
  printShortcut?: string;
  /** Back arrow + heading above the rows (a ⋯ drill view) */
  onBack?: () => void;
  heading?: string;
}

export function ExportMenu({ scope = "view", count, filtered, view, subitems, comments, summary, formats = EXPORT_FORMATS, onExport, onPrint, printShortcut, onBack, heading }: ExportMenuProps) {
  const title = heading ?? (scope === "item" ? "Export item" : "Export view");
  const rows = (
    <>
      {formats.map((f) => (
        <MenuItem key={f.id} icon={f.icon} title={f.hint} trailing={<span className="td-export-ext">{f.ext}</span>} onSelect={() => onExport(f.id)}>
          {f.label}
        </MenuItem>
      ))}
      <MenuNote>{summary ?? exportSummary({ scope, count, filtered, view, subitems, comments })}</MenuNote>
      {onPrint ? (
        <>
          <MenuDivider />
          <MenuItem icon="printer" shortcut={printShortcut} onSelect={onPrint}>
            Print
          </MenuItem>
        </>
      ) : null}
    </>
  );
  if (!onBack) return rows;
  // Drill view: Back is a menu row (arrow keys reach it) and the title names the group of export rows.
  return (
    <MenuGroup>
      <div className="td-prp-head">
        <BaseMenu.Item nativeButton closeOnClick={false} onClick={onBack} render={<IconButton name="arrow-left" label="Back" size={22} iconSize={13} />} />
        <BaseMenu.GroupLabel render={<span />} className="td-prp-head-title">
          {title}
        </BaseMenu.GroupLabel>
      </div>
      {rows}
    </MenuGroup>
  );
}

/** A download IconButton that opens the ExportMenu. */
export function ExportButton({ label = "Export", tooltip = "Export", variant = "ghost", size = 32, tier = "menu", width = 232, ...menu }: ExportMenuProps & { label?: string; tooltip?: string; variant?: "ghost" | "chrome"; size?: number; tier?: "menu" | "nav" | "detached" | "toolbar"; width?: number }) {
  return (
    <MenuButton icon="download" label={label} tooltip={tooltip} variant={variant} size={size} tier={tier} width={width}>
      <ExportMenu {...menu} />
    </MenuButton>
  );
}
