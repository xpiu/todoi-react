// The sidebar's arrangement as pure functions, shared by Sidebar (drag and drop, Alt+↑↓), SidebarOrder (Settings ›
// Appearance) and the app, which stores the arrangement per account. Spec: DESIGN.md › Sidebar reordering.

/**
 * An ordered list of ids from a stored order and the default one: the stored ids first (known ones, once each); an id
 * the stored order lacks lands right after its predecessor in the default order, so a new group or project appears
 * where the host added it. Stale ids are dropped.
 */
export function orderIds(order: ReadonlyArray<string> | undefined, base: ReadonlyArray<string>): string[] {
  const known = new Set(base);
  const out = (order ?? []).filter((id, i, a) => known.has(id) && a.indexOf(id) === i);
  base.forEach((id, i) => {
    if (out.includes(id)) return;
    out.splice(i ? out.indexOf(base[i - 1]!) + 1 : 0, 0, id);
  });
  return out;
}

/** Rows sorted by `orderIds` */
export function orderBy<T extends { id: string }>(rows: ReadonlyArray<T>, order: ReadonlyArray<string> | undefined): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return orderIds(order, rows.map((r) => r.id)).map((id) => byId.get(id)!);
}

/** Move one id to `index` (counted without it) */
export function moveId(ids: ReadonlyArray<string>, id: string, index: number): string[] {
  const out = ids.filter((x) => x !== id);
  out.splice(Math.max(0, Math.min(index, out.length)), 0, id);
  return out;
}

/**
 * Apply a project move to groups: the project leaves its group and enters `groupId` at `index` (counted without the
 * moved project). New arrays; an unknown project or group returns the input.
 */
export function moveProject<P extends { id: string }, G extends { id: string; projects: ReadonlyArray<P> }>(groups: ReadonlyArray<G>, projectId: string, groupId: string, index: number): G[] {
  const p = groups.flatMap((g) => g.projects).find((x) => x.id === projectId);
  if (!p || !groups.some((g) => g.id === groupId)) return [...groups];
  return groups.map((g) => {
    const has = g.projects.includes(p);
    if (!has && g.id !== groupId) return g;
    const ps = g.projects.filter((x) => x !== p);
    if (g.id === groupId) ps.splice(Math.max(0, Math.min(index, ps.length)), 0, p);
    return { ...g, projects: ps };
  });
}
