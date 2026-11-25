// Three-way merge of project documents: the last synced version (base), Todoi's (ours) and the file's
// (theirs). It works on the parsed model, never on text, so it is the same for every format. Items and
// lists match by id; a change on one side wins; both sides changing the same thing differently is a
// conflict, decided by `choices` (per conflict key) or the `prefer` policy. Sets — labels, assignees,
// attachments, comments, custom fields — merge member by member, so they rarely conflict. Pure and
// deterministic: the same inputs always give the same document and the same conflict keys.
import { newEmbridgeId } from "../embridge";
import type { DocComment, DocItem, DocList, DocSubitem, ProjectDoc } from "./model";

export type Side = "ours" | "theirs";

/** Item properties the merge compares one by one. */
export const MERGE_FIELDS = ["title", "done", "status", "priority", "start", "due", "description", "place"] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export interface MergeConflict {
  /** Stable across runs with the same inputs: what `choices` is keyed by */
  key: string;
  kind: "field" | "edited-deleted" | "deleted-edited" | "list-name" | "list-removed";
  /** The item or list this is about */
  id: string;
  title: string;
  field?: MergeField;
  base?: unknown;
  ours?: unknown;
  theirs?: unknown;
}

export interface MergeOptions {
  /** Per conflict key; overrides `prefer` */
  choices?: Readonly<Record<string, Side>>;
  /** How undecided conflicts land in the merged document (default: ours, i.e. Todoi's) */
  prefer?: Side;
  /** Ids for items and lists the file added without one */
  newId?: () => string;
}

export interface MergeResult {
  doc: ProjectDoc;
  /** Every conflict, decided or not */
  conflicts: MergeConflict[];
  /** Conflicts neither `choices` covered: the ones a person still has to look at under a "manual" policy */
  open: MergeConflict[];
  /** Whether the merged document differs from ours / from theirs (what has to be applied / written) */
  changed: { ours: boolean; theirs: boolean };
}

// ── Flattened view: every item with where it sits ──────────────────────────────────────────────────
interface Placed {
  item: DocSubitem;
  /** "list:<id>" for a top-level item, "item:<id>" for a subitem */
  place: string;
}
const itemProps = (it: DocItem | DocSubitem): DocSubitem => {
  const { subitems: _subs, ...rest } = it as DocItem;
  return rest;
};
function flatten(doc: ProjectDoc): { items: Map<string, Placed>; order: Map<string, string[]>; lists: Map<string, DocList> } {
  const items = new Map<string, Placed>();
  const order = new Map<string, string[]>();
  const lists = new Map<string, DocList>();
  for (const l of doc.lists) {
    const lid = l.id!;
    lists.set(lid, l);
    order.set(`list:${lid}`, l.items.map((it) => it.id!));
    for (const it of l.items) {
      items.set(it.id!, { item: itemProps(it), place: `list:${lid}` });
      order.set(`item:${it.id!}`, it.subitems.map((s) => s.id!));
      for (const s of it.subitems) items.set(s.id!, { item: s, place: `item:${it.id!}` });
    }
  }
  return { items, order, lists };
}

/** Every item and list gets an id (the file's own, or a fresh one); repeats become fresh ids too. */
export function withIds(doc: ProjectDoc, newId: () => string = newEmbridgeId): ProjectDoc {
  /** A fresh id not in `seen`; a source that keeps repeating itself gets a counter suffix instead of a loop. */
  const fresh = (seen: Set<string>) => {
    let id = newId();
    for (let n = 2; seen.has(id); n++) id = n > 5 ? `${newId()}-${n}` : newId();
    seen.add(id);
    return id;
  };
  const keep = (seen: Set<string>, id: string | null) => (id && !seen.has(id) ? (seen.add(id), id) : fresh(seen));
  const itemIds = new Set<string>(), listIds = new Set<string>();
  return {
    ...doc,
    lists: doc.lists.map((l) => ({ ...l, id: keep(listIds, l.id), items: l.items.map((it) => ({ ...it, id: keep(itemIds, it.id), subitems: it.subitems.map((s) => ({ ...s, id: keep(itemIds, s.id) })) })) })),
  };
}

/** JSON with object keys sorted, so documents built by different codecs compare by content. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const commentKey = (c: DocComment) => JSON.stringify([c.author, c.at, c.text, c.depth]);

/** Three-way merge of two lists of members (by key): what either side added or removed, in ours' order with theirs' additions after. */
function mergeSet<T>(base: readonly T[], ours: readonly T[], theirs: readonly T[], key: (v: T) => string = (v) => JSON.stringify(v)): T[] {
  const b = new Set(base.map(key)), o = new Set(ours.map(key)), t = new Set(theirs.map(key));
  const keep = (k: string) => (b.has(k) ? o.has(k) && t.has(k) : o.has(k) || t.has(k));
  const out: T[] = [];
  const added = new Set<string>();
  for (const v of [...ours, ...theirs]) {
    const k = key(v);
    if (added.has(k) || !keep(k)) continue;
    added.add(k);
    out.push(v);
  }
  return out;
}

function mergeRecord(base: Readonly<Record<string, string>>, ours: Readonly<Record<string, string>>, theirs: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of [...new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])].sort()) {
    const b = base[k], o = ours[k], t = theirs[k];
    // Per key: a one-sided change wins; both changing it differently keeps Todoi's.
    const v = o === b ? t : t === b ? o : o;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Merge the order of one container: a side that reordered wins over one that didn't; additions land after their predecessor. */
function mergeOrder(base: readonly string[], ours: readonly string[], theirs: readonly string[], survivors: ReadonlySet<string>): string[] {
  const inBase = new Set(base);
  const relative = (xs: readonly string[]) => xs.filter((x) => inBase.has(x) && survivors.has(x));
  const oRel = relative(ours), tRel = relative(theirs), bRel = relative(base);
  const out = same(oRel, bRel) ? tRel : oRel;
  const placed = new Set(out);
  const insertFrom = (seq: readonly string[]) => {
    let after: string | null = null;
    for (const id of seq) {
      if (survivors.has(id) && !placed.has(id)) {
        out.splice(after === null ? 0 : out.indexOf(after) + 1, 0, id);
        placed.add(id);
      }
      if (placed.has(id)) after = id;
    }
  };
  insertFrom(ours);
  insertFrom(theirs);
  return out;
}

export function mergeDocs(baseDoc: ProjectDoc | null, oursDoc: ProjectDoc, theirsDoc: ProjectDoc, opts: MergeOptions = {}): MergeResult {
  const newId = opts.newId ?? newEmbridgeId;
  const prefer = opts.prefer ?? "ours";
  // Ids once per side: the file's new items keep the ids they get here in everything below.
  const baseI = withIds(baseDoc ?? { title: "", uuid: null, lists: [] }, newId), oursI = withIds(oursDoc, newId), theirsI = withIds(theirsDoc, newId);
  const base = flatten(baseI), ours = flatten(oursI), theirs = flatten(theirsI);
  const conflicts: MergeConflict[] = [];
  const decide = (c: Omit<MergeConflict, "key"> & { key?: string }): Side => {
    const key = c.key ?? `${c.kind}:${c.id}${c.field ? `:${c.field}` : ""}`;
    conflicts.push({ ...c, key });
    return opts.choices?.[key] ?? prefer;
  };

  // ── Lists ──
  const listIds = [...new Set([...ours.lists.keys(), ...theirs.lists.keys(), ...base.lists.keys()])];
  const mergedLists = new Map<string, { name: string }>();
  for (const id of listIds) {
    const b = base.lists.get(id), o = ours.lists.get(id), t = theirs.lists.get(id);
    if (o && t) {
      let name = o.name;
      if (o.name !== t.name) {
        if (b && o.name === b.name) name = t.name;
        else if (!(b && t.name === b.name)) name = decide({ kind: "list-name", id, title: o.name, base: b?.name, ours: o.name, theirs: t.name }) === "ours" ? o.name : t.name;
      }
      mergedLists.set(id, { name });
    } else if (o || t) {
      const present = (o ?? t)!;
      if (!b) mergedLists.set(id, { name: present.name });
      else {
        // Removed on one side. Keep it if the other side changed it or put items in it.
        const side: Side = o ? "ours" : "theirs";
        const flat = side === "ours" ? ours : theirs;
        const touched = present.name !== b.name || (flat.order.get(`list:${id}`) ?? []).some((iid) => !base.items.has(iid) || !same(flat.items.get(iid), base.items.get(iid)));
        if (touched) {
          const keep = decide({ kind: "list-removed", id, title: present.name, ours: !!o, theirs: !!t }) === side;
          if (keep) mergedLists.set(id, { name: present.name });
        }
      }
    }
  }

  // ── Items ──
  const ids = [...new Set([...ours.items.keys(), ...theirs.items.keys(), ...base.items.keys()])];
  const merged = new Map<string, Placed>();
  for (const id of ids) {
    const b = base.items.get(id), o = ours.items.get(id), t = theirs.items.get(id);
    if (!o && !t) continue;
    if (!o || !t) {
      const present = (o ?? t)!;
      if (!b) {
        merged.set(id, present);
        continue;
      }
      // Deleted on one side: gone, unless the other side changed it meanwhile.
      if (same(present, b)) continue;
      const kind = o ? "edited-deleted" : "deleted-edited";
      const keep = decide({ kind, id, title: present.item.title }) === (o ? "ours" : "theirs");
      if (keep) merged.set(id, present);
      continue;
    }
    const pick = <K extends MergeField>(field: K, bv: unknown, ov: unknown, tv: unknown): unknown => {
      if (same(ov, tv)) return ov;
      if (b && same(ov, bv)) return tv;
      if (b && same(tv, bv)) return ov;
      return decide({ kind: "field", id, title: o.item.title, field, base: bv, ours: ov, theirs: tv }) === "ours" ? ov : tv;
    };
    const bi = b?.item;
    const item: DocSubitem = {
      id,
      title: pick("title", bi?.title, o.item.title, t.item.title) as string,
      done: pick("done", bi?.done, o.item.done, t.item.done) as boolean,
      status: pick("status", bi?.status, o.item.status, t.item.status) as DocSubitem["status"],
      priority: pick("priority", bi?.priority, o.item.priority, t.item.priority) as DocSubitem["priority"],
      start: pick("start", bi?.start, o.item.start, t.item.start) as string | null,
      due: pick("due", bi?.due, o.item.due, t.item.due) as string | null,
      description: pick("description", bi?.description, o.item.description, t.item.description) as string | null,
      labels: mergeSet(bi?.labels ?? [], o.item.labels, t.item.labels),
      assignees: mergeSet(bi?.assignees ?? [], o.item.assignees, t.item.assignees),
      comments: mergeSet(bi?.comments ?? [], o.item.comments, t.item.comments, commentKey),
      attachments: mergeSet(bi?.attachments ?? [], o.item.attachments, t.item.attachments, (a) => a.url),
      fields: mergeRecord(bi?.fields ?? {}, o.item.fields, t.item.fields),
    };
    // Done and Status move together: a merged "done" with an open Status (or the reverse) follows done.
    if (item.done && item.status !== "DONE") item.status = "DONE";
    if (!item.done && item.status === "DONE") item.status = null;
    merged.set(id, { item, place: pick("place", b?.place, o.place, t.place) as string });
  }

  // An item whose place is gone (its list removed, or its parent deleted or now a subitem) moves to safety.
  const firstList = [...mergedLists.keys()][0];
  for (const [id, p] of merged) {
    const [kind, target] = p.place.split(/:(.+)/) as ["list" | "item", string];
    const parent = kind === "item" ? merged.get(target) : null;
    const ok = kind === "list" ? mergedLists.has(target) : !!parent && parent.place.startsWith("list:");
    if (ok) continue;
    const fallback = parent?.place ?? (kind === "item" ? (ours.items.get(target) ?? theirs.items.get(target) ?? base.items.get(target))?.place : null);
    const home = fallback && mergedLists.has(fallback.slice(5)) ? fallback : firstList ? `list:${firstList}` : null;
    if (home) merged.set(id, { ...p, place: home });
    else merged.delete(id);
  }

  // ── Assemble, ordered ──
  const children = new Map<string, Set<string>>();
  for (const [id, p] of merged) {
    if (!children.has(p.place)) children.set(p.place, new Set());
    children.get(p.place)!.add(id);
  }
  const orderOf = (container: string) => mergeOrder(base.order.get(container) ?? [], ours.order.get(container) ?? [], theirs.order.get(container) ?? [], children.get(container) ?? new Set());
  const placeAll = (container: string) => {
    const ordered = orderOf(container);
    // Anything that moved here from elsewhere and isn't in either side's order of this container goes last.
    for (const id of children.get(container) ?? []) if (!ordered.includes(id)) ordered.push(id);
    return ordered;
  };
  const listOrder = mergeOrder([...base.lists.keys()], [...ours.lists.keys()], [...theirs.lists.keys()], new Set(mergedLists.keys()));
  for (const id of mergedLists.keys()) if (!listOrder.includes(id)) listOrder.push(id);

  const doc: ProjectDoc = {
    // The project's title: a one-sided change wins; otherwise Todoi's.
    title: baseDoc && oursDoc.title === baseDoc.title ? theirsDoc.title || oursDoc.title : oursDoc.title || theirsDoc.title,
    uuid: oursDoc.uuid ?? theirsDoc.uuid,
    lists: listOrder.map((lid) => ({
      id: lid,
      name: mergedLists.get(lid)!.name,
      items: placeAll(`list:${lid}`).map((iid): DocItem => ({ ...merged.get(iid)!.item, subitems: placeAll(`item:${iid}`).map((sid) => merged.get(sid)!.item) })),
    })),
  };
  const decided = new Set(Object.keys(opts.choices ?? {}));
  const content = (d: ProjectDoc) => stable({ title: d.title, lists: d.lists });
  return {
    doc,
    conflicts,
    open: conflicts.filter((c) => !decided.has(c.key)),
    // Against each side as it came in (theirs without ids counts as changed: the ids still have to be written).
    changed: { ours: content(doc) !== content(oursDoc), theirs: content(doc) !== content(theirsDoc) },
  };
}
