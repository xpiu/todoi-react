// ShortcutsDialog — the ? cheat sheet, rendered from the canonical SHORTCUTS registry so docs and
// behaviour never drift. Spec: DESIGN.md › Shortcut map.
import { Dialog } from "../core/Dialog";
import { Keys } from "../core/ShortcutHint";
import { SHORTCUTS, type ShortcutSection } from "../core/shortcuts";
import "./ShortcutsDialog.css";

export interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
  sections?: ReadonlyArray<ShortcutSection>;
  note?: string;
}

export function ShortcutsDialog({ open, onClose, sections = SHORTCUTS.sections, note }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width={720}>
      <div className="td-scd-grid">
        {sections.map((sec) => (
          <section key={sec.title} className="td-scd-sec">
            <h3>{sec.title}</h3>
            <div className="td-scd-rows">
              {sec.rows.map((r, i) => (
                <div key={i} className="td-scd-row">
                  <Keys keys={r[0]} />
                  <span className="td-scd-desc">{r[1]}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="td-scd-note">{note ?? (SHORTCUTS.isMac ? "⌘ is Ctrl on Windows and Linux. " : "Cmd substitutes for Ctrl on macOS. ") + "Shortcuts pause while you’re typing in a field."}</div>
    </Dialog>
  );
}
