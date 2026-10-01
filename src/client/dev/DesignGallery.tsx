// /dev/ds — every core primitive rendered in one page, for eyes and for Playwright. The theme × mode
// switcher at the top drives the real appearance store; `?device=phone&touch=1` forces the viewport
// classes. Not a product surface: no routing beyond the pathname check in App.
import { useState } from "react";

import { Avatar, AvatarStack } from "../design/core/Avatar";
import { Button } from "../design/core/Button";
import { Checkbox } from "../design/core/Checkbox";
import { ConnectionStatus } from "../design/core/ConnectionStatus";
import { DatePicker } from "../design/core/DatePicker";
import { DatesPicker, type DatesValue } from "../design/core/DatesPicker";
import { ConfirmDialog, Dialog } from "../design/core/Dialog";
import { EmptyState } from "../design/core/EmptyState";
import { Icon } from "../design/core/Icon";
import { IconButton } from "../design/core/IconButton";
import { Markdown } from "../design/core/Markdown";
import { MenuButton, MenuDivider, MenuItem, MenuNote } from "../design/core/Menu";
import { Popover, usePopover } from "../design/core/Popover";
import { ProgressBar } from "../design/core/ProgressBar";
import { RepeatPicker } from "../design/core/RepeatPicker";
import { Segmented } from "../design/core/Segmented";
import { Select } from "../design/core/Select";
import { Skeleton, ViewSkeleton } from "../design/core/Skeleton";
import { STATUSES } from "../design/core/statuses";
import { StatusChip } from "../design/core/StatusChip";
import { SwatchGroup } from "../design/core/SwatchGroup";
import { Switch } from "../design/core/Switch";
import { SyncNotice } from "../design/core/SyncNotice";
import { TextField } from "../design/core/TextField";
import { Toast } from "../design/core/Toast";
import { Tooltip } from "../design/core/Tooltip";
import { useAppearance } from "../design/core/appearance";
import type { RepeatRule } from "../design/core/repeat";
import { MODES, THEMES } from "../design/core/themes";
import { useViewport } from "../design/core/viewport";
import "./DesignGallery.css";

const TODAY = "2026-08-25";
const MEMBERS = [
  { name: "Flo Zuallaert", nickname: "flo" },
  { name: "Sam Verhoeven", nickname: "sam" },
  { name: "Marit Olsen" },
  { name: "Jonas Berg" },
];
const LIST_OPTIONS = [
  { value: "new", label: "New", icon: "circle-dashed" as const },
  { value: "todo", label: "To-do", icon: "circle-todo" as const },
  { value: "doing", label: "Doing", icon: "circle-dot" as const, iconColor: "var(--label-blue)" },
  { value: "done", label: "Done", icon: "circle-check" as const, iconColor: "var(--success-icon)" },
];
const MANY = Array.from({ length: 12 }, (_, i) => ({ value: `tz${i}`, label: `Europe/City ${i + 1}`, hint: `UTC+${i}` }));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="td-gal-section" data-section={title}>
      <h2 className="td-gal-h">{title}</h2>
      <div className="td-gal-row">{children}</div>
    </section>
  );
}

export function DesignGallery() {
  const ap = useAppearance();
  const vp = useViewport();
  const [checked, setChecked] = useState(false);
  const [circle, setCircle] = useState(false);
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState("list");
  const [swatch, setSwatch] = useState<string | null>(ap.background);
  const [sel, setSel] = useState<string | null>("doing");
  const [tz, setTz] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>("2026-09-12");
  const [dates, setDates] = useState<DatesValue>({ start: "2026-09-10", due: "2026-09-12", time: "14:00" });
  const [repeat, setRepeat] = useState<RepeatRule | null>({ freq: "weekly", byWeekday: [4], ends: { type: "after", count: 10 } });
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>("Moved “Pricing page” to Doing — Status set to Doing");
  const [notice, setNotice] = useState(true);
  const panel = usePopover();

  return (
    <div className="td-gal">
      <header className="td-gal-top">
        <strong>Todoi design primitives</strong>
        <Segmented aria-label="Theme" value={ap.theme} onChange={(t) => ap.set({ theme: t })} options={THEMES.map((t) => ({ id: t.id, label: t.label }))} />
        <Segmented aria-label="Mode" value={ap.mode} onChange={(m) => ap.set({ mode: m })} options={MODES.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))} />
        <span className="td-gal-meta">
          {vp.device} · touch {String(vp.touch)}
        </span>
      </header>

      <Section title="Buttons">
        <Button variant="primary" icon="plus">
          Add an item
        </Button>
        <Button>Subtle</Button>
        <Button variant="outline" iconAfter="chevron-down">
          Outline
        </Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete project</Button>
        <Button variant="primary" size="lg">
          Large
        </Button>
        <Button disabled>Disabled</Button>
        <span className="td-gal-chrome">
          <Button variant="chrome" icon="filter">
            Filter
          </Button>
          <Button variant="chrome-ghost">Hide</Button>
          <Button variant="inverse">Add a list</Button>
          <IconButton name="panel-right" label="Hide sidebar" tooltip="Hide sidebar" variant="chrome" />
        </span>
        <IconButton name="ellipsis" label="More actions" tooltip="More actions" />
        <Tooltip text="Copy link" side="top">
          <button type="button" className="td-btn">
            Tooltip on top
          </button>
        </Tooltip>
      </Section>

      <Section title="Controls">
        <Checkbox checked={checked} onChange={setChecked} label="Checklist row" />
        <Checkbox shape="circle" checked={circle} onChange={setCircle} aria-label="Complete item" />
        <Checkbox shape="circle" recurring checked={false} onChange={() => {}} aria-label="Recurring (holds 650ms)" />
        <Switch checked={on} onChange={setOn} label="Email delivery" />
        <Switch checked disabled aria-label="Locked" />
        <Segmented aria-label="View" value={seg} onChange={setSeg} options={[{ id: "list", label: "List", icon: "list" }, { id: "board", label: "Board", icon: "kanban" }, { id: "calendar", label: "Cal.", icon: "calendar" }]} />
        <Segmented size="sm" aria-label="Time format" value="24" options={[{ id: "24", label: "24-hour" }, { id: "12", label: "12-hour" }]} />
        <TextField placeholder="Write a comment…" aria-label="Comment" style={{ width: 220 }} />
        <TextField icon="search" placeholder="Search" aria-label="Search" style={{ width: 200 }} />
        <span className="td-gal-chrome">
          <TextField dark icon="search" placeholder="Search" aria-label="Search the project" style={{ width: 200 }} />
        </span>
        <TextField multiline placeholder="Add a more detailed description…" aria-label="Description" style={{ width: 260 }} />
      </Section>

      <Section title="Swatches">
        <SwatchGroup aria-label="Background colour" options={ap.backgrounds} value={swatch} onChange={(v) => setSwatch(v)} />
        <SwatchGroup aria-label="Foreground" labeled options={ap.foregrounds.map((f) => ({ value: f.id, label: f.label, title: f.title, swatch: `linear-gradient(90deg, ${f.list} 50%, ${f.card} 50%)` }))} value={ap.foreground} disabled={!ap.foregrounds.length} />
      </Section>

      <Section title="Avatars, progress, status">
        <Avatar name="Flo Zuallaert" />
        <Avatar name="Sam Verhoeven" size={20} />
        <Avatar name="Marit Olsen" color="var(--label-teal)" size={28} />
        <AvatarStack people={MEMBERS} size={24} />
        <AvatarStack people={MEMBERS} size={20} max={2} />
        <ProgressBar value={33} style={{ width: 120 }} aria-label="Checklist 2 of 6" />
        <ProgressBar value={80} height={4} color="var(--blue-500)" style={{ width: 120 }} aria-label="Upload" />
        {STATUSES.map((s) => (
          <StatusChip key={s.id} status={s.id} />
        ))}
        <StatusChip status="DONE" iconOnly />
        <span className="td-gal-icons">
          {(["clock", "square-check-big", "align-left", "paperclip", "user-plus", "tag", "message-square", "circle-check", "circle-todo", "circle-dashed", "circle-dot", "archive", "kanban", "list", "calendar", "panel-left", "panel-right", "github"] as const).map((n) => (
            <Icon key={n} name={n} size={16} />
          ))}
        </span>
      </Section>

      <Section title="Popover, menu, select">
        <MenuButton label="Item actions" tooltip="More">
          <MenuItem icon="pencil" shortcut="E">
            Rename
          </MenuItem>
          <MenuItem icon="arrow-right" drill>
            Move to
          </MenuItem>
          <MenuItem icon="copy">Duplicate</MenuItem>
          <MenuDivider />
          <MenuItem icon="archive">Archive</MenuItem>
          <MenuItem icon="trash-2" danger shortcut="⌫">
            Delete
          </MenuItem>
          <MenuNote>Deleted items stay in the Trash for 90 days.</MenuNote>
        </MenuButton>
        <Select aria-label="Status" options={[{ value: null, label: "None", icon: "circle" }, ...LIST_OPTIONS]} value={sel} onChange={(v) => setSel(v)} />
        <Select aria-label="Time zone" placeholder="Automatic" options={MANY} value={tz} onChange={(v) => setTz(v)} width={240} />
        <Popover
          open={panel.open}
          onOpenChange={panel.setOpen}
          role="dialog"
          aria-label="Share project"
          placement="bottom-end"
          width={260}
          trigger={
            <Button variant="outline" icon="share-2">
              Custom panel
            </Button>
          }
        >
          <div className="td-gal-panel">
            <strong>Share project</strong>
            <TextField value="https://todoi.com/p/helicopters" readOnly aria-label="Project URL" />
            <Button variant="primary" onClick={panel.close}>
              Copy project URL
            </Button>
          </div>
        </Popover>
        <Button variant="outline" onClick={() => setDialog(true)}>
          Open dialog
        </Button>
        <Button variant="outline" onClick={() => setConfirm(true)}>
          Confirm (danger)
        </Button>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="New project"
          footerLead="Enter creates · Esc cancels"
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDialog(false)}>
                Create
              </Button>
            </>
          }
        >
          <div className="td-gal-stack">
            <TextField placeholder="Project name" aria-label="Project name" />
            <Select aria-label="Project group" options={[{ value: "mkt", label: "Marketing & PR" }, { value: "sales", label: "Sales" }]} value="mkt" block />
          </div>
        </Dialog>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} title="Delete “Dealers & stock”?" body="Its 14 items move to the Trash for 90 days. Members lose access at once." confirmLabel="Delete project" danger footerLead="This can't be undone after 90 days" />
      </Section>

      <Section title="Dates and repeat">
        <DatePicker value={date} onChange={(iso) => setDate(iso)} today={TODAY} aria-label="Until" />
        <DatesPicker start={dates.start} due={dates.due} time={dates.time} onChange={setDates} today={TODAY} state="default" />
        <DatesPicker start={null} due="2026-08-18" time={null} onChange={() => {}} today={TODAY} state="overdue" />
        <RepeatPicker value={repeat} onChange={setRepeat} anchor={dates.due} today={TODAY} />
      </Section>

      <Section title="States">
        <div className="td-gal-wide">
          <EmptyState icon="list" title="No lists in this project yet" hint="Add a list to start collecting items, or begin with the usual three." action={{ label: "Add a list", icon: "plus", shortcut: "shift N" }} secondary={{ label: "To-do · Doing · Done" }} />
          <EmptyState surface="card" compact icon="inbox" title="Your inbox is empty" hint="Items you capture here can be dragged onto a project later." />
          <EmptyState tone="danger" icon="cloud-off" title="Couldn't load this project" hint="Nothing is cached on this device yet." action={{ label: "Retry", icon: "refresh-cw" }} secondary={{ label: "Details" }} />
          <div className="td-gal-skeletons">
            <Skeleton width={120} />
            <Skeleton width={16} height={16} round />
            <ViewSkeleton view="list" lists={1} delay={0} style={{ height: 180 }} />
          </div>
          {notice ? (
            <SyncNotice placement="inline" message="Sync failed — GitHub didn't respond" detail="Your changes are saved on this device and sync when the connection returns. Last synced 12 minutes ago." action={{ label: "Retry", icon: "refresh-cw" }} secondary={{ label: "Details" }} onDismiss={() => setNotice(false)} />
          ) : (
            <Button variant="ghost" onClick={() => setNotice(true)}>
              Show notice again
            </Button>
          )}
          <span className="td-gal-chrome">
            <ConnectionStatus online={false} pending={3} lastSynced="2026-08-25T10:00:00Z" onSyncNow={() => {}} onOpenSettings={() => {}} />
            <ConnectionStatus syncing pending={3} />
            <ConnectionStatus showWhenIdle />
          </span>
        </div>
      </Section>

      <Section title="Markdown">
        <div className="td-gal-wide">
          <Markdown
            members={MEMBERS}
            onOpenKey={() => {}}
            text={"# Launch plan\nEverything before the shop goes live. @flo takes the pages, see MP-112.\n\n- [x] Get the list from both dealers\n- [ ] Decide which models we sell **online**\n\n> Both dealers want the price hidden on the new models.\n\n`npm run dev` · ~~old~~ · [Todoi](https://todoi.com)"}
          />
        </div>
      </Section>

      {toast ? <Toast message={toast} icon="arrow-right" actionLabel="Undo" shortcutHint="⌘ Z" onAction={() => setToast(null)} onDismiss={() => setToast(null)} duration={0} /> : null}
    </div>
  );
}
