// The project's effective view state: the URL's ad-hoc `v / f / s`, or — when `?view=` names a saved
// view — that view's definition. Both the shell and the project screen read it from here.
import { useSavedViews, type SavedView } from "../data/savedViews";
import { decodeViewState, type DecodedViewState } from "../design/navigation/viewState";
import type { ProjectView } from "../../shared/enums";

export function useResolvedView(projectId: string, search: Record<string, unknown>, defaultView?: ProjectView) {
  const raw = decodeViewState(search);
  const saved = useSavedViews(projectId);
  const active: SavedView | null = raw.savedView ? (saved.data?.find((v) => v.id === raw.savedView) ?? null) : null;
  const d = active?.definition;
  const state: DecodedViewState = d ? { ...raw, view: d.view ?? raw.view, filters: d.filters ?? [], sort: { lists: d.sort?.lists ?? null, items: d.sort?.items ?? null } } : raw;
  return { raw, state, active, savedViews: saved.data ?? [], view: state.view ?? defaultView ?? ("list" as ProjectView) };
}
