// ShortcutsDialog — the ? cheat sheet, rendered from the canonical SHORTCUTS registry so docs and
// behaviour never drift. Spec: DESIGN.md › Shortcut map.
import { Dialog } from "../core/Dialog";
import { SHORTCUTS, type ShortcutSection } from "../core/shortcuts";
import "./ShortcutsDialog.css";
import "../core/kbd.css";

const SEPS = new Set(["+", "or", "then", "–"]);

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
            <h4>{sec.title}</h4>
            <div className="td-scd-rows">
              {sec.rows.map((r, i) => (
                <div key={i} className="td-scd-row">
                  <span className="td-scd-keys">{r[0].map((tok, j) => (SEPS.has(tok) ? <span key={j} className="td-scd-sep">{tok}</span> : <kbd key={j} className="td-kbd">{SHORTCUTS.keyLabel(tok)}</kbd>))}</span>
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
