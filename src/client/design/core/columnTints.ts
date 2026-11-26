// The pool of 20 column tints behind "Colorize Board columns" for lists with no Status role. Ids are 1 to 20 and
// name the tokens --column-tint-<id> in tokens/themes/<theme>.css (each theme × mode has its own 20 values for the
// same 20 hues). The order is the contract: every tint is at least 60° of hue from the one before it, so handing
// them out in order keeps neighbouring columns apart. Derived on the device, never stored (no field, no migration).
// Spec: DESIGN.md › Board; Design guidelines/colors-column-tints.html.
import type { ItemStatus } from "../../../shared/item-status";
import { suggestedRoleForTitle } from "./statuses";

export interface ColumnTint {
  /** 1 to 20: the token --column-tint-<id> */
  id: number;
  name: string;
  /** OKLCH hue angle */
  hue: number;
}

/** The 20 pool tints in assignment order */
export const COLUMN_TINTS: ReadonlyArray<ColumnTint> = [
  { id: 1, name: "Violet", hue: 292 },
  { id: 2, name: "Orange", hue: 52 },
  { id: 3, name: "Teal", hue: 187 },
  { id: 4, name: "Pink", hue: 340 },
  { id: 5, name: "Lime", hue: 122 },
  { id: 6, name: "Azure", hue: 226 },
  { id: 7, name: "Red", hue: 28 },
  { id: 8, name: "Orchid", hue: 316 },
  { id: 9, name: "Cyan", hue: 200 },
  { id: 10, name: "Amber", hue: 64 },
  { id: 11, name: "Indigo", hue: 280 },
  { id: 12, name: "Rose", hue: 4 },
  { id: 13, name: "Jade", hue: 174 },
  { id: 14, name: "Magenta", hue: 328 },
  { id: 15, name: "Vermilion", hue: 40 },
  { id: 16, name: "Sky", hue: 213 },
  { id: 17, name: "Purple", hue: 304 },
  { id: 18, name: "Crimson", hue: 16 },
  { id: 19, name: "Cobalt", hue: 239 },
  { id: 20, name: "Raspberry", hue: 352 },
];

export interface TintableList {
  id: string;
  name: string;
  statusRole?: ItemStatus | null;
}

export const ColumnTints = {
  tints: COLUMN_TINTS,
  /** n wrapped into 1 to 20 (the 21st list takes tint 1 again); anything that is not a whole number from 1 up gives null */
  index(n: number | null | undefined): number | null {
    return typeof n === "number" && Number.isInteger(n) && n >= 1 ? ((n - 1) % COLUMN_TINTS.length) + 1 : null;
  },
  /**
   * The pool tint per list id, handed out in the order given (pass a stable order: creation order, hidden lists
   * included, so hiding a list moves no colour). A list with a role, set or suggested by its title, gets null: its
   * status tint wins, and Backlog stays neutral.
   */
  assign(lists: ReadonlyArray<TintableList>): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    let n = 0;
    for (const l of lists) out[l.id] = (l.statusRole ?? suggestedRoleForTitle(l.name)) ? null : ColumnTints.index(++n);
    return out;
  },
};
