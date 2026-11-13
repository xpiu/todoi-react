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
      <div className="td-shortcuts-dialog-grid">
        {sections.map((sec) => (
          <section key={sec.title} className="td-shortcuts-dialog-section">
            <h3>{sec.title}</h3>
            <div className="td-shortcuts-dialog-rows">
              {sec.rows.map((r, i) => (
                <div key={i} className="td-shortcuts-dialog-row">
                  <Keys keys={r[0]} />
                  <span className="td-shortcuts-dialog-description">{r[1]}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="td-shortcuts-dialog-note">{note ?? (SHORTCUTS.isMac ? "⌘ is Ctrl on Windows and Linux. " : "Cmd substitutes for Ctrl on macOS. ") + "Shortcuts pause while you’re typing in a field."}</div>
    </Dialog>
  );
}
