// The app-level keyboard model (DESIGN.md › Shortcut map): everything that is not a per-item key.
// Single keys pause while typing and while a dialog is open; the G chord waits one second for its second key.
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { SHORTCUTS } from "../design/core/shortcuts";
import { useFeedback } from "./feedback";

export interface AppShortcutHandlers {
  projectId?: string;
  openPalette: () => void;
  openHelp: () => void;
  /** Any modal is open: single keys must not fire */
  modalOpen: boolean;
  clearFilters?: () => void;
  openFilter?: () => void;
  addList?: () => void;
}

const typing = () => {
  const t = document.activeElement as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

export function useAppShortcuts(h: AppShortcutHandlers) {
  const navigate = useNavigate();
  const undo = useFeedback((s) => s.undo);
  const latest = useRef(h);
  useEffect(() => {
    latest.current = h;
  });
  useEffect(() => {
    let chord: ReturnType<typeof setTimeout> | null = null;
    let chordArmed = false;
    const onKey = (e: KeyboardEvent) => {
      const c = latest.current;
      // Ctrl/Cmd+K works everywhere except inside a field; Ctrl+Z always.
      if (SHORTCUTS.is("palette", e)) {
        if (typing()) return;
        e.preventDefault();
        c.openPalette();
        return;
      }
      if (c.modalOpen || typing()) return;
      if (chordArmed) {
        chordArmed = false;
        if (chord) clearTimeout(chord);
        const t = SHORTCUTS.goTarget(e.key);
        if (t) {
          e.preventDefault();
          if (t.view && c.projectId) void navigate({ to: "/p/$projectId", params: { projectId: c.projectId }, search: (prev: Record<string, unknown>) => ({ ...prev, v: t.view, view: undefined }) });
          else if (t.nav) void navigate({ to: `/${t.nav}` });
          return;
        }
      }
      if (SHORTCUTS.is("chord-g", e)) {
        chordArmed = true;
        chord = setTimeout(() => {
          chordArmed = false;
        }, 1000);
        return;
      }
      if (SHORTCUTS.is("undo", e)) {
        e.preventDefault();
        undo();
      } else if (SHORTCUTS.is("help", e)) {
        e.preventDefault();
        c.openHelp();
      } else if (SHORTCUTS.is("search", e)) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.td-topnav input[aria-label="Search"]')?.focus();
      } else if (SHORTCUTS.is("new-item", e)) {
        // N opens quick-add in the focused item's list, else the first visible add trigger.
        e.preventDefault();
        const focused = document.activeElement?.closest?.(".td-lsec, .td-list");
        const btn = (focused ?? document).querySelector<HTMLButtonElement>("[data-add-item]");
        btn?.click();
      } else if (SHORTCUTS.is("new-list", e)) {
        e.preventDefault();
        c.addList?.();
      } else if (SHORTCUTS.is("clear-filters", e)) {
        e.preventDefault();
        c.clearFilters?.();
      } else if (SHORTCUTS.is("filter", e)) {
        e.preventDefault();
        c.openFilter?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (chord) clearTimeout(chord);
    };
  }, [navigate, undo]);
}
