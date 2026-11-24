// SearchScreen — the Search page on real data (/search?q=): the server's full-text search over titles, descriptions
// and comments (app/search.ts › useFullSearch), its filters in the address, and the item overlay over the page
// (`?item=`), so closing it returns to the results. Archived results open through the "is archived" dialog
// (MissingItem). Spec: DESIGN.md › Search page.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "../data/api";
import { itemLocationQuery, projectsOf, searchPeopleQuery, useGroups, useLabels, useProject, useProjectItems } from "../data/queries";
import { useAppearanceStore, useProjectIcons } from "../design/core/appearance";
import type { IconName } from "../design/core/Icon";
import { SearchResults, type SearchFilters, type SearchResult } from "../design/navigation/SearchResults";
import { NO_LABELS, useInbox } from "./inbox";
import { ItemOverlayScreen } from "./ItemOverlayScreen";
import { MissingItem } from "./MissingItem";
import { hitKey, useFullSearch } from "./search";
import { StateDialog } from "./StateDialog";

const route = getRouteApi("/app/search");
/** The address follows the typed query this long after the last key */
const ADDRESS_DELAY_MS = 300;

export function SearchScreen() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const showItemIds = useAppearanceStore((s) => s.showItemIds);
  const projectIcons = useProjectIcons();
  const groups = useGroups();
  const people = useQuery(searchPeopleQuery());
  // The field owns the typed text; the address catches up (replacing its entry, so Back leaves the page rather than
  // stepping through keystrokes). A query from outside (the top bar's "See all results") replaces the text.
  const [query, setQuery] = useState(search.q ?? "");
  const [seenQ, setSeenQ] = useState(search.q);
  if (search.q !== seenQ) {
    setSeenQ(search.q);
    if ((search.q ?? "") !== query.trim()) setQuery(search.q ?? "");
  }
  useEffect(() => {
    const q = query.trim() || undefined;
    if (q === search.q) return;
    const t = setTimeout(() => void navigate({ to: "/search", search: (s) => ({ ...s, q }), replace: true }), ADDRESS_DELAY_MS);
    return () => clearTimeout(t);
  }, [query, search.q, navigate]);
  const filters: SearchFilters = { project: search.project ?? null, status: search.status ?? null, assignee: search.assignee ?? null, archived: !!search.archived };
  const found = useFullSearch(query, filters);
  const results: SearchResult[] = found.hits.map((h) => ({ id: h.id, itemId: hitKey(h), title: h.title, projectName: h.projectName ?? undefined, listName: h.listName, done: h.done, archived: h.archived, match: h.match }));
  const projects = projectsOf(groups.data).map((p) => ({ id: p.id, name: p.name, icon: projectIcons ? ((p.icon ?? "kanban") as IconName) : undefined, color: projectIcons && p.color ? `var(--label-${p.color})` : undefined }));
  const hit = search.item ? found.hits.find((h) => h.id === search.item) : undefined;
  const knownHit = hit && !hit.archived ? { projectId: hit.projectId } : undefined;
  const openItem = (id: string, edit?: boolean) => void navigate({ to: "/search", search: (s) => ({ ...s, item: id, edit: edit || undefined }) });
  // Closing the overlay returns focus to the result that opened it: the list's roving result. The overlay's dialogs
  // (a moment of "Opening the item…" first) leave focus on the body.
  const closing = useRef(false);
  const closeItem = () => {
    closing.current = true;
    void navigate({ to: "/search", search: (s) => ({ ...s, item: undefined, edit: undefined }) });
  };
  useEffect(() => {
    if (search.item || !closing.current) return;
    closing.current = false;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) document.querySelector<HTMLElement>('.td-search-row[tabindex="0"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [search.item]);
  return (
    <>
      <SearchResults
        query={query}
        onQueryChange={setQuery}
        results={results}
        total={found.total}
        status={found.status}
        error={found.error}
        onRetry={found.retry}
        offline={found.offline}
        filters={filters}
        onFiltersChange={(f) => void navigate({ to: "/search", search: (s) => ({ ...s, project: f.project ?? undefined, status: (f.status as typeof s.status) ?? undefined, assignee: f.assignee ?? undefined, archived: f.archived || undefined }), replace: true })}
        projects={projects}
        members={people.data ?? []}
        showItemIds={showItemIds}
        onShowMore={found.more}
        moreStatus={found.moreStatus}
        onOpen={(r) => openItem(r.id)}
      />
      {search.item ? <SearchItemOverlay key={search.item} known={knownHit} itemId={search.item} editTitle={search.edit} onClose={closeItem} onOpen={openItem} /> : null}
    </>
  );
}

interface OverlayProps {
  itemId: string;
  editTitle?: boolean;
  onClose: () => void;
  onOpen: (id: string, edit?: boolean) => void;
}

/**
 * The item overlay over the Search page, wherever the item lives; an item that isn't live says why (MissingItem).
 * A live result already says where it lives (`known`); otherwise (an address opened as is, an archived result) ask.
 */
function SearchItemOverlay({ known: hint, ...props }: OverlayProps & { known?: { projectId: string | null } }) {
  // Read once per opened item (the overlay is keyed by it): a refresh of the results never swaps its source.
  const [known] = useState(hint);
  const where = useQuery({ ...itemLocationQuery(props.itemId), enabled: !known });
  const it = known ? { ...known, state: "live" } : where.data;
  if (!it && where.isPending) return <Opening onClose={props.onClose} />;
  if (!it || it.state !== "live") return <MissingItem itemId={props.itemId} projectId={it?.projectId ?? null} onClose={props.onClose} />;
  return it.projectId ? <ProjectItemOverlay {...props} projectId={it.projectId} /> : <InboxItemOverlay {...props} />;
}

const OPENING_DELAY_MS = 300;
/** "Opening the item…", only when loading takes long enough to notice: the overlay usually opens without it. */
function Opening({ onClose }: { onClose: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), OPENING_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return slow ? <StateDialog title="Opening the item…" body="pending" onClose={onClose} /> : null;
}

function ProjectItemOverlay({ projectId, ...props }: OverlayProps & { projectId: string }) {
  const project = useProject(projectId);
  const items = useProjectItems(projectId);
  const labels = useLabels(projectId);
  const failed = project.error ?? items.error ?? labels.error;
  if (failed)
    return (
      <StateDialog
        title="Couldn't load this item"
        body={`${errorMessage(failed)} Check the connection and try again.`}
        action={{ label: "Retry", onClick: () => void Promise.all([project.refetch(), items.refetch(), labels.refetch()]) }}
        onClose={props.onClose}
      />
    );
  if (!project.data || !items.data || !labels.data) return <Opening onClose={props.onClose} />;
  return <ItemOverlayScreen {...props} projectId={projectId} project={project.data} items={items.data} labels={labels.data} />;
}

function InboxItemOverlay(props: OverlayProps) {
  const { items, container } = useInbox();
  if (items.error) return <StateDialog title="Couldn't load this item" body={`${errorMessage(items.error)} Check the connection and try again.`} action={{ label: "Retry", onClick: () => void items.refetch() }} onClose={props.onClose} />;
  if (!items.data) return <Opening onClose={props.onClose} />;
  return <ItemOverlayScreen {...props} projectId={null} project={container} items={items.data} labels={NO_LABELS} />;
}
