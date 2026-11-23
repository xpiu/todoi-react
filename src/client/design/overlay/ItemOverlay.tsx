// ItemOverlay — the fully assembled item-editing modal: title (click or E to rename), description,
// subitems, relations, activity thread with the comment composer; the aside carries list · Status ·
// Priority │ Dates · Repeat · Labels · Assignees │ Cover · Relations │ Watch. ctrl+↵ commits whatever
// is mid-edit and closes. Every change is the consumer's callback. Spec: DESIGN.md › Item overlay.
import { useEffect, useRef, useState } from "react";

import { ExportMenu, type ExportFormatId } from "../core/ExportMenu";
import { ProjectPicker, type PickableList, type PickableProject } from "../core/ProjectPicker";
import { AttachmentList, DropOverlay, isImageFile, useFileDrop, type AttachmentFile } from "./Attachments";
import { ItemSection } from "./ItemSection";

import type { ItemPriority } from "../../../shared/enums";
import type { ItemStatus } from "../../../shared/item-status";
import type { RelationType } from "../../../shared/enums";
import { listIconFor } from "../board/listIcons";
import { Button } from "../core/Button";
import { DatesPicker, type DatesValue } from "../core/DatesPicker";
import { COPY_FAILED, copyIcon, useCopy } from "../core/clipboard";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { InlineError } from "../core/InlineError";
import { Skeleton } from "../core/Skeleton";
import { MakeSubitemDrill, type PickableItem } from "../core/ItemPicker";
import { LabelPicker, type LabelDraft, type PickableLabel } from "../core/LabelPicker";
import { MemberPicker, type PickableMember } from "../core/MemberPicker";
import { MenuButton, MenuDivider, MenuItem, useMenuDrill } from "../core/Menu";
import { Popover, usePopover } from "../core/Popover";
import type { RepeatRule } from "../core/repeat";
import { RepeatPicker } from "../core/RepeatPicker";
import { useReturnFocus } from "../core/returnFocus";
import { Select } from "../core/Select";
import { SHORTCUTS } from "../core/shortcuts";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, priorityOf, priorityValue, statusMovesItem, statusPick, statusValue } from "../core/itemFields";
import { TextField } from "../core/TextField";
import { Checklist, ChecklistAddRow, type ChecklistItem } from "./Checklist";
import { Comment, type CommentReaction } from "./Comment";
import { CommentComposer, mentionHandle, type MentionMember } from "./CommentComposer";
import { CoverPicker, type CoverValue } from "./CoverPicker";
import { DescriptionEditor } from "./DescriptionEditor";
import { Modal } from "./Modal";
import { RelationButton, RelationsSection, type Relation } from "./Relations";
import "./ItemOverlay.css";


export interface OverlayItem {
  id: string;
  itemId?: string;
  title: string;
  description?: string | null;
  listId: string;
  status: ItemStatus | null;
  done: boolean;
  priority: ItemPriority | null;
  start?: string | null;
  due?: string | null;
  dueTime?: string | null;
  dueState?: "default" | "overdue" | "complete";
  repeat?: RepeatRule | null;
  labelIds: string[];
  assigneeIds: string[];
  cover: CoverValue | null;
  watching?: boolean;
  subitems: ChecklistItem[];
  attachments?: AttachmentFile[];
}
export interface OverlayComment {
  id: string;
  author: string;
  authorId: string;
  src?: string;
  color?: string;
  meta: string;
  text: string;
  edited?: boolean;
  reactions: CommentReaction[];
}

export interface OverlayActivity {
  id: string;
  src?: string;
  author: string;
  meta: string;
  text: string;
}
export type OverlayMenuAction = "duplicate" | "archive" | "delete" | "share";
/** Unsent work the overlay can resume: the comment (and whom it replies to) and the description edit. */
export interface OverlayDrafts {
  comment?: string;
  /** Stable submission identity, retained while a queued comment awaits confirmation. */
  commentId?: string;
  replyTo?: { id: string; author: string } | null;
  /** null or absent = not editing the description */
  description?: string | null;
}
/** A save the overlay waits for: it keeps the draft and shows the reason when the promise rejects. */
type Save = void | Promise<unknown>;

export interface ItemOverlayProps {
  open: boolean;
  item: OverlayItem;
  lists: Array<{ id: string; name: string; icon?: IconName | null; statusRole?: ItemStatus | null }>;
  labels: ReadonlyArray<PickableLabel>;
  members: ReadonlyArray<PickableMember & MentionMember>;
  currentUserId: string;
  comments: OverlayComment[];
  activity: OverlayActivity[];
  relations: Relation[];
  /** Comments, files, links and watching while they load or after they failed — never shown as empty @default ready */
  detailsState?: "loading" | { error: string; onRetry: () => void };
  /** Every other item in the project (relations, subitem moves, "Make subitem of…") */
  projectItems: PickableItem[];
  /** An Inbox item: "Move to project…" (filing) takes the list select's place; labels and assignees,
   * which belong to a project, are left out */
  inbox?: boolean;
  /** The project's "Link Lists with Status". When on and every list carries its own Status role (none missing,
   * none shared), the List field is hidden and Status stands in for it: picking a Status calls onMoveToList with the
   * list that has that role (the move sets the Status). None, a Status no list carries and Done on a recurring item
   * call onSetStatus and leave the item where it is. Off, a list without a role, two lists sharing one, or an item
   * in a hidden list (not in `lists`) or the Inbox: List and Status both show and a Status edit never moves the item. */
  linkStatuses?: boolean;
  /** The E shortcut: open with the title in edit */
  autoEditTitle?: boolean;
  today?: string;
  onClose: () => void;
  onRename: (title: string) => Save;
  onMoveToList: (listId: string) => void;
  onCreateList?: () => void;
  onManageLinks?: () => void;
  onSetStatus: (status: ItemStatus | null) => void;
  onSetPriority: (priority: ItemPriority | null) => void;
  onSetDates: (v: DatesValue) => void;
  onSetRepeat: (rule: RepeatRule | null) => void;
  onSetLabels: (ids: string[]) => void;
  onCreateLabel?: (d: LabelDraft) => Promise<PickableLabel | void>;
  onEditLabel?: (label: PickableLabel, d: LabelDraft) => void;
  onDeleteLabel?: (label: PickableLabel) => void;
  onSetAssignees: (ids: string[]) => void;
  onSetCover: (cover: CoverValue | null) => void;
  onToggleWatch?: (watching: boolean) => void;
  onSetDescription: (md: string) => Save;
  onAddSubitem: (title: string) => void;
  onToggleSubitem: (id: string, done: boolean) => void;
  onReorderSubitem: (id: string, index: number) => void;
  onOpenSubitem?: (id: string) => void;
  onConvertSubitem?: (id: string) => void;
  onMoveSubitem?: (id: string, target: PickableItem) => void;
  onDeleteSubitem?: (id: string) => void;
  onDeleteSubitems?: () => void;
  onAddRelation: (type: RelationType, item: PickableItem) => void;
  onRemoveRelation: (type: RelationType, itemId: string) => void;
  onOpenItem?: (id: string) => void;
  onOpenKey?: (key: string) => void;
  onAddComment: (text: string, replyToId?: string) => Save;
  onEditComment: (id: string, text: string) => Save;
  onDeleteComment: (id: string) => void;
  onReactComment: (id: string, emoji: string) => void;
  onMakeSubitemOf?: (parent: PickableItem) => void;
  onMenuAction: (action: OverlayMenuAction) => void;
  onAddFiles?: (files: File[], opts?: { cover?: boolean }) => void;
  /** retry / dismiss act on a failed or in-flight upload (its row's id) */
  onAttachmentAction?: (id: string, action: "open" | "download" | "delete" | "rename" | "retry" | "dismiss", arg?: string) => void;
  onExport?: (format: ExportFormatId) => void;
  onPrint?: () => void;
  /** Other projects for Move / Copy to project… */
  projects?: PickableProject[];
  loadLists?: (projectId: string) => Promise<PickableList[]>;
  onMoveToProject?: (project: PickableProject, list: PickableList) => void;
  onCopyToProject?: (project: PickableProject, list: PickableList) => void;
  onSuggestShortcut?: (id: string, delay?: number) => void;
  /** Drafts kept from an earlier visit */
  drafts?: OverlayDrafts;
  /** Every draft change, so the consumer can keep them while the overlay is closed */
  onDraftsChange?: (drafts: OverlayDrafts) => void;
}

const reason = (err: unknown) => (err instanceof Error && err.message ? err.message : "something went wrong");

export function ItemOverlay(p: ItemOverlayProps) {
  const { item, open, onClose } = p;
  const [localDrafts, setLocalDrafts] = useState<OverlayDrafts>(p.drafts ?? {});
  const drafts = p.onDraftsChange ? p.drafts ?? {} : localDrafts;
  const draft = drafts.comment ?? "";
  const replyTo = drafts.replyTo ?? null;
  // Async saves patch the current draft and notify the current consumer; neither may be the
  // version captured when the request started.
  const currentDrafts = useRef(drafts);
  const onDraftsChange = useRef(p.onDraftsChange);
  useEffect(() => {
    currentDrafts.current = drafts;
    onDraftsChange.current = p.onDraftsChange;
  });
  const updateDrafts = (patch: Partial<OverlayDrafts>) => {
    const next = { ...currentDrafts.current, ...patch };
    currentDrafts.current = next;
    if (onDraftsChange.current) onDraftsChange.current(next);
    else setLocalDrafts((previous) => ({ ...previous, ...patch }));
  };
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const saveDescription = useRef<(() => Promise<boolean>) | null>(null);
  const [titleEdit, setTitleEdit] = useState<string | null>(p.autoEditTitle ? item.title : null);
  const [subDraft, setSubDraft] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [linkCopied, copy] = useCopy(900);
  // The ⋯ menu's drill views; an Inbox item's aside "Move to project…" opens the same picker in a popover
  const drill = useMenuDrill<"main" | "export" | "move" | "copy" | "subitem">("main");
  const menuView = drill.view;
  const filing = usePopover();
  const pickerRef = useRef<(() => void) | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  // Esc takes the focused search field with it: focus returns to the Search activity button.
  const searchButton = useRef<HTMLButtonElement>(null);
  const leavingSearch = useReturnFocus(searchOpen, searchButton);
  const files = item.attachments ?? [];
  const [dragging, dropHandlers] = useFileDrop((fs) => p.onAddFiles?.(fs), { disabled: !p.onAddFiles });
  // Enter / Esc take the focused field with them: focus returns to the title (focusable, not a tab stop).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const leavingTitle = useReturnFocus(titleEdit != null, titleRef);
  /** A failed rename reopens the title with what was typed. */
  const commitTitle = async (): Promise<boolean> => {
    const t = (titleEdit ?? "").trim();
    leavingTitle();
    setTitleEdit(null);
    if (!t || t === item.title) return true;
    try {
      await p.onRename(t);
      return true;
    } catch {
      setTitleEdit(t);
      return false;
    }
  };
  const addSubitem = (t: string) => {
    p.onAddSubitem(t);
    setAddOpen(true);
  };
  /** The draft and reply target clear only once the comment is saved; a failure keeps both and says why. */
  const send = async (t?: string): Promise<boolean> => {
    const text = (t ?? draft).trim();
    if (!text || sending) return !text;
    setSending(true);
    setSendError(null);
    try {
      await p.onAddComment(text, replyTo?.id);
      const latest = currentDrafts.current;
      if ((latest.comment ?? "").trim() === text && latest.replyTo?.id === replyTo?.id) updateDrafts({ comment: "", replyTo: null });
      return true;
    } catch (err) {
      setSendError(`Couldn't send: ${reason(err)}`);
      return false;
    } finally {
      setSending(false);
    }
  };
  const copyLink = () => void copy(`${location.origin}${location.pathname}?item=${item.id}`);
  // ctrl+↵: commit whatever is mid-edit (title, description, new subitem, comment), then close once
  // every save has landed; a failure keeps the overlay open with that draft and its reason.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!SHORTCUTS.is("save-close", e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (subDraft.trim()) addSubitem(subDraft.trim());
      const saves = [titleEdit != null ? commitTitle() : null, saveDescription.current?.() ?? null, draft.trim() ? send() : null];
      void Promise.all(saves).then((ok) => ok.every((v) => v !== false) && onClose());
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });
  useEffect(() => {
    if (searchOpen) searchRef.current?.querySelector("input")?.focus();
  }, [searchOpen]);

  const listOpts = p.lists.map((l) => {
    const auto = listIconFor(l.name);
    return { value: l.id, label: l.name, icon: (l.icon as IconName | undefined) ?? auto.icon, iconColor: auto.color };
  });
  const status = statusValue(item.status, item.done);
  // Linked project: Status names every list (each carries its own role), so it stands in for the List field.
  const currentList = p.lists.find((l) => l.id === item.listId);
  const statusOnly = !p.inbox && statusMovesItem(p.lists, p.linkStatuses, item.listId);
  const pickStatus = (v: string) => {
    const pick = statusPick(v, { lists: p.lists, movesItem: statusOnly, listId: item.listId, recurring: !!(item.repeat && item.due) });
    if ("moveTo" in pick) p.onMoveToList(pick.moveTo);
    else p.onSetStatus(pick.status);
  };
  const statusTitle = statusOnly && currentList && currentList.statusRole !== item.status ? `Status · in list ${currentList.name}` : "Status";
  const others = p.projectItems.filter((it) => it.id !== item.id);
  // An item with subitems can't become one ("has subitems" trails its row); Design's menu widths per view
  const subitemBlocked = item.subitems.length > 0;
  const menuWidth = { main: p.onMakeSubitemOf && subitemBlocked ? 252 : 200, export: 236, move: 280, copy: 280, subitem: 260 }[menuView];
  const q = query.trim().toLowerCase();
  const matches = (text: string, author: string) => !q || `${text} ${author}`.toLowerCase().includes(q);
  const members = p.members;
  const onDark = !!item.cover && !item.cover.src && item.cover.color === "var(--chrome-topbar)";
  const cornerVariant = onDark ? "chrome" : "ghost";

  /** Move / Copy to project…: the ⋯ menu's drill view (Back returns to the rows) and the Inbox aside's popover */
  const transferPicker = (kind: "move" | "copy", onBack: (() => void) | undefined, close: () => void) => (
    <ProjectPicker
      projects={p.projects ?? []}
      loadLists={p.loadLists}
      action={kind}
      onBack={onBack}
      onPick={(proj, list) => {
        close();
        (kind === "copy" ? p.onCopyToProject : p.onMoveToProject)?.(proj, list);
      }}
    />
  );

  const title = (
    <h2 ref={titleRef} tabIndex={-1} className={"td-modal-title" + (titleEdit != null ? " is-editing" : "")} title={titleEdit == null ? "Click to edit title" : undefined} onClick={() => titleEdit == null && setTitleEdit(item.title)}>
      {titleEdit == null ? (
        item.title
      ) : (
        <input
          autoFocus
          value={titleEdit}
          aria-label="Item title"
          className="td-modal-title-input"
          // Rename: the whole title selected, so typing replaces it and ← / → keep it
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTitleEdit(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTitle();
            else if (e.key === "Escape") {
              e.stopPropagation();
              leavingTitle();
              setTitleEdit(null);
            } else if (e.key.length === 1) e.stopPropagation();
          }}
        />
      )}
    </h2>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      aria-label={item.title}
      rootProps={dropHandlers}
      cover={item.cover ? (item.cover.src ? { src: item.cover.src } : { color: item.cover.color ?? "var(--surface-cover)" }) : null}
      corner={
        <>
          {item.itemId ? (
            <span className="td-modal-key" data-on-dark={onDark ? "true" : undefined} title={linkCopied === "failed" ? COPY_FAILED : "Copy item link"} onClick={copyLink}>
              {linkCopied === "copied" ? "Copied" : linkCopied === "failed" ? "Couldn't copy" : item.itemId}
            </span>
          ) : null}
          <IconButton name={copyIcon(linkCopied, "link")} label="Copy item link" tooltip={linkCopied === "failed" ? COPY_FAILED : "Copy item link"} iconSize={16} variant={cornerVariant} onClick={copyLink} />
          <MenuButton label="Item options" variant={cornerVariant} tier="detached" width={menuWidth} onOpenChange={(o) => !o && drill.back()} shouldClose={drill.shouldClose}>
            {(close) =>
              menuView === "export" && p.onExport ? (
                <ExportMenu
                  scope="item"
                  subitems={item.subitems.length}
                  comments={p.comments.length > 0}
                  onBack={drill.back}
                  onExport={(f) => {
                    close();
                    p.onExport?.(f);
                  }}
                  onPrint={p.onPrint ? () => {
                    close();
                    p.onPrint?.();
                  } : undefined}
                  printShortcut={`${SHORTCUTS.modLabel} P`}
                />
              ) : (menuView === "move" || menuView === "copy") && (menuView === "copy" ? p.onCopyToProject : p.onMoveToProject) ? (
                transferPicker(menuView, drill.back, close)
              ) : menuView === "subitem" && p.onMakeSubitemOf ? (
                <MakeSubitemDrill
                  onBack={drill.back}
                  items={others}
                  onPick={(t) => {
                    close();
                    p.onMakeSubitemOf?.(t);
                  }}
                />
              ) : (
                <>
                  {p.onMoveToProject ? (
                    <MenuItem icon="folder-input" drill onSelect={() => drill.setView("move")}>
                      Move to project…
                    </MenuItem>
                  ) : null}
                  <MenuItem icon="copy" onSelect={() => p.onMenuAction("duplicate")}>
                    Duplicate
                  </MenuItem>
                  {p.onCopyToProject ? (
                    <MenuItem icon="folder-output" drill onSelect={() => drill.setView("copy")}>
                      Copy to project…
                    </MenuItem>
                  ) : null}
                  {p.onMakeSubitemOf ? (
                    <MenuItem icon="corner-down-right" drill={!subitemBlocked} disabled={subitemBlocked} trailing={subitemBlocked ? "has subitems" : undefined} onSelect={() => drill.setView("subitem")}>
                      Make subitem of…
                    </MenuItem>
                  ) : null}
                  <MenuItem icon="share-2" onSelect={() => p.onMenuAction("share")}>
                    Share
                  </MenuItem>
                  {p.onExport ? (
                    <MenuItem icon="download" drill onSelect={() => drill.setView("export")}>
                      Export…
                    </MenuItem>
                  ) : null}
                  <MenuDivider />
            <MenuItem icon="archive" onSelect={() => p.onMenuAction("archive")}>
              Archive
            </MenuItem>
                  <MenuItem icon="trash-2" danger onSelect={() => p.onMenuAction("delete")}>
                    Delete
                  </MenuItem>
                </>
              )
            }
          </MenuButton>
          <IconButton name="x" label="Close" variant={cornerVariant} onClick={onClose} />
        </>
      }
      aside={
        <div className="td-aside-stack">
          {p.inbox ? (
            p.onMoveToProject ? (
              <Popover
                open={filing.open}
                onOpenChange={filing.setOpen}
                tier="detached"
                width={280}
                role="dialog"
                aria-label="Move to project"
                block
                trigger={
                  <Button variant="outline" icon="folder-input" data-block="true" className="td-aside-btn">
                    Move to project…
                  </Button>
                }
              >
                {transferPicker("move", undefined, filing.close)}
              </Popover>
            ) : null
          ) : statusOnly ? null : (
            <Select block tier="detached" aria-label="Move to list" title="Move to list" value={item.listId} options={listOpts} width={200} onChange={(v) => v !== item.listId && p.onMoveToList(v)} footer={p.onCreateList || p.onManageLinks ? <>{p.onCreateList ? <button type="button" className="td-menu-item td-select-foot" onClick={p.onCreateList}><Icon name="plus" size={15} />Create new list</button> : null}{p.onManageLinks ? <><div className="td-menu-divider" role="separator" /><button type="button" className="td-menu-item td-select-foot" title="A list can carry a Status role. A project setting decides whether moving an item also updates its Status." onClick={p.onManageLinks}><Icon name="link-2" size={15} />Linked to a Status role</button></> : null}</> : undefined} />
          )}
          <Select
            block
            tier="detached"
            aria-label="Status"
            title={statusTitle}
            value={status}
            options={STATUS_OPTIONS}
            width={200}
            onChange={pickStatus}
            footer={
              statusOnly ? (
                p.onManageLinks ? (
                  <>
                    <div className="td-menu-divider" role="separator" />
                    <button type="button" className="td-menu-item td-select-foot" title="This project links lists to Status. Turn the link off on the Projects page to show the List field and move items without changing their Status." onClick={p.onManageLinks}>
                    <Icon name="link-2" size={15} />
                    Lists linked with Status
                  </button>
                  </>
                ) : null
              ) : (
                <>
                  <div className="td-menu-divider" role="separator" />
                  <div className="td-menu-note" title="A list can carry a Status role. Editing Status directly never moves the item.">Status is set here or by a linked list move. Editing it never moves the item.</div>
                </>
              )
            }
          />
          <Select block tier="detached" aria-label="Priority" title="Priority" placeholder="Priority" icon="flag" value={priorityValue(item.priority)} width={184} options={PRIORITY_OPTIONS} onChange={(v) => p.onSetPriority(priorityOf(v))} />
          <div className="td-aside-divider" />
          <DatesPicker block tier="detached" start={item.start} due={item.due} time={item.dueTime} state={item.dueState ?? (item.done ? "complete" : undefined)} today={p.today} onChange={p.onSetDates} />
          <RepeatPicker block tier="detached" value={item.repeat ?? null} anchor={item.due} today={p.today} onChange={p.onSetRepeat} />
          {p.inbox ? null : (
            <>
              <LabelPicker block tier="detached" labels={p.labels} value={item.labelIds} onChange={p.onSetLabels} onCreateLabel={p.onCreateLabel} onEditLabel={p.onEditLabel} onDeleteLabel={p.onDeleteLabel} />
              <MemberPicker block tier="detached" members={members} value={item.assigneeIds} onChange={p.onSetAssignees} />
            </>
          )}
          <div className="td-aside-divider" />
          <Button variant="outline" icon="paperclip" className="td-aside-btn" disabled={!p.onAddFiles} onClick={() => pickerRef.current?.()}>
            Attachment
          </Button>
          <CoverPicker block tier="detached" cover={item.cover} images={files.filter((f) => isImageFile(f) && f.src).map((f) => ({ id: f.id, name: f.name, src: f.src! }))} onChange={p.onSetCover} onUpload={p.onAddFiles ? (f) => p.onAddFiles?.([f], { cover: true }) : undefined} />
          <RelationButton block tier="detached" items={others} exclude={p.relations.map((r) => r.item.id)} onAdd={p.onAddRelation} />
          {p.onToggleWatch ? (
            <>
              <div className="td-aside-divider" />
              <Button variant="outline" icon={item.watching ? "eye" : "eye-off"} aria-pressed={!!item.watching} title={item.watching ? "You get notified about changes to this item" : "Get notified about changes to this item"} className="td-aside-btn" onClick={() => p.onToggleWatch?.(!item.watching)}>
                {item.watching ? "Watching" : "Watch"}
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <DropOverlay active={dragging} hint="Images can become the cover" />
      <div className="td-overlay-main">
        <div className="td-overlay-description">
          <DescriptionEditor value={item.description ?? ""} members={members} onOpenKey={p.onOpenKey} onChange={p.onSetDescription} onDraft={(description) => updateDrafts({ description })} initialDraft={p.drafts?.description} saveRef={saveDescription} onSuggestShortcut={p.onSuggestShortcut} />
        </div>
        {item.subitems.length ? (
          <div className="td-overlay-subitems">
            <Checklist items={item.subitems} onToggle={p.onToggleSubitem} onReorder={p.onReorderSubitem} onAddItem={addSubitem} addOpen={addOpen} onAddDraft={setSubDraft} onAddClose={() => setAddOpen(false)} onOpenItem={p.onOpenSubitem} onConvertItem={p.onConvertSubitem} onMoveItem={p.onMoveSubitem} moveTargets={others} onDeleteItem={p.onDeleteSubitem} onDelete={p.onDeleteSubitems} />
          </div>
        ) : (
          <div className="td-overlay-addsub">
            <ChecklistAddRow onCommit={addSubitem} onDraft={setSubDraft} />
          </div>
        )}
        {p.detailsState === "loading" ? (
          <div className="td-overlay-details-state" role="status" aria-busy="true">
            <span className="td-sr-only">Loading comments, files and links</span>
            <Skeleton width="55%" />
            <Skeleton width="35%" />
          </div>
        ) : p.detailsState ? (
          <div className="td-overlay-details-state">
            <InlineError message={`Couldn't load comments, files and links. ${p.detailsState.error}`} />
            <Button variant="outline" icon="refresh-cw" onClick={p.detailsState.onRetry}>
              Retry
            </Button>
          </div>
        ) : null}
        {files.length || p.onAddFiles ? (
          <ItemSection icon="paperclip" title="Attachments" className={files.length ? undefined : "td-item-section-hidden"} action={p.onAddFiles ? <Button onClick={() => pickerRef.current?.()}>Add</Button> : null}>
            <AttachmentList
              files={files}
              pickerRef={pickerRef}
              onAdd={p.onAddFiles ? (fs) => p.onAddFiles?.(fs) : undefined}
              onOpen={p.onAttachmentAction ? (id) => p.onAttachmentAction?.(id, "open") : undefined}
              onDownload={p.onAttachmentAction ? (id) => p.onAttachmentAction?.(id, "download") : undefined}
              onMakeCover={(id) => {
                const f = files.find((x) => x.id === id);
                if (f?.src) p.onSetCover({ src: f.src, attachmentId: f.id });
              }}
              onRemoveCover={() => p.onSetCover(null)}
              onRename={p.onAttachmentAction ? (id, n) => p.onAttachmentAction?.(id, "rename", n) : undefined}
              onDelete={p.onAttachmentAction ? (id) => p.onAttachmentAction?.(id, "delete") : undefined}
              onRetry={p.onAttachmentAction ? (id) => p.onAttachmentAction?.(id, "retry") : undefined}
              onDismiss={p.onAttachmentAction ? (id) => p.onAttachmentAction?.(id, "dismiss") : undefined}
            />
          </ItemSection>
        ) : null}
        {p.relations.length ? <RelationsSection relations={p.relations} items={others} excludeIds={[item.id]} onAdd={p.onAddRelation} onRemove={p.onRemoveRelation} onOpen={p.onOpenItem} /> : null}
        <div className="td-activity">
          <div className="td-activity-head">
            <Icon name="activity" size={20} className="td-activity-glyph" />
            <span className="td-activity-title">Activity</span>
            <IconButton ref={searchButton} name="search" label="Search activity" tooltip="Search activity" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)} />
            {searchOpen ? (
              <div className="td-activity-search" ref={searchRef} onBlur={() => {
                setSearchOpen(false);
                setQuery("");
              }}>
                <TextField icon="search" placeholder="Search activity…" aria-label="Search activity" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    leavingSearch();
                    setSearchOpen(false);
                    setQuery("");
                  } else if (e.key.length === 1) e.stopPropagation();
                }} />
              </div>
            ) : null}
          </div>
          <CommentComposer value={draft} onChange={(v) => { updateDrafts({ comment: v }); setSendError(null); }} members={members} onSubmit={(t) => void send(t)} pending={sending} error={sendError} replyTo={replyTo?.author ?? null} onCancelReply={() => updateDrafts({ replyTo: null })} />
          {p.comments.filter((c) => matches(c.text, c.author)).map((c) => (
            <Comment
              key={c.id}
              author={c.author}
              src={c.src}
              color={c.color}
              meta={c.meta}
              text={c.text}
              edited={c.edited}
              members={members}
              reactions={c.reactions}
              mine={c.authorId === p.currentUserId}
              onOpenKey={p.onOpenKey}
              onReact={(e) => p.onReactComment(c.id, e)}
              onEdit={(t) => p.onEditComment(c.id, t)}
              onDelete={() => p.onDeleteComment(c.id)}
              onReply={() => {
                const m = members.find((x) => x.id === c.authorId);
                const h = `@${m ? mentionHandle(m) : c.author.split(/\s+/)[0]} `;
                updateDrafts({ replyTo: { id: c.id, author: c.author }, comment: draft.startsWith(h) ? draft : h + draft });
              }}
            />
          ))}
          {p.activity.filter((a) => matches(a.text, a.author)).map((a) => (
            <Comment key={a.id} author={a.author} src={a.src} meta={a.meta} variant="activity">
              {a.text}
            </Comment>
          ))}
        </div>
      </div>
    </Modal>
  );
}
