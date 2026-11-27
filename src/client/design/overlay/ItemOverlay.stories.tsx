import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import type { PickableItem } from "../core/ItemPicker";
import { ItemOverlay, type OverlayItem } from "./ItemOverlay";

const svg = (fill: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${fill}"/></svg>`);

const PROJECT_ITEMS: PickableItem[] = [
  { id: "i1", itemId: "HE-115", title: "Prepare the helicopter quote", listName: "Doing", status: "DOING" },
  { id: "i2", itemId: "HE-116", title: "Book the maintenance slot", listName: "To do", status: "TODO" },
  { id: "i3", itemId: "HE-102", title: "Send the training schedule", listName: "Done", status: "DONE", done: true },
  { id: "i4", itemId: "HE-120", title: "Confirm the export licence", listName: "Doing", status: "DOING" },
];
const ITEM: OverlayItem = {
  id: "i1",
  itemId: "HE-115",
  title: "Prepare the helicopter quote",
  description: "Quote the **H145** with the optional rescue hoist.\n\n- Delivery in March\n- Training for two pilots",
  listId: "l2",
  status: "DOING",
  done: false,
  priority: "HIGH",
  start: "2026-10-05",
  due: "2026-10-09",
  dueTime: "14:00",
  dueState: "default",
  repeat: null,
  labelIds: ["lb1"],
  assigneeIds: ["u1", "u2"],
  cover: null,
  watching: true,
  subitems: [
    { id: "s1", itemId: "HE-130", text: "Collect the optional equipment list", done: true },
    { id: "s2", itemId: "HE-131", text: "Agree the payment terms with finance", done: false },
  ],
  attachments: [
    { id: "f1", name: "hangar.png", mime: "image/png", src: svg("steelblue"), size: 482_000, meta: "Added Sep 12" },
    { id: "f2", name: "quote-helicopters-europe.pdf", mime: "application/pdf", size: 248_000, meta: "Added Sep 14" },
  ],
};
const retryDetails = fn();

const meta = {
  title: "Overlay/ItemOverlay",
  component: ItemOverlay,
  args: {
    open: true,
    item: ITEM,
    lists: [{ id: "l1", name: "To do" }, { id: "l2", name: "Doing", statusRole: "DOING" }, { id: "l3", name: "Done" }],
    labels: [{ id: "lb1", name: "Sales", color: "blue" }, { id: "lb2", name: "Customer", color: "teal" }],
    members: [
      { id: "u1", name: "todoi", color: "var(--label-blue)" },
      { id: "u2", name: "Sam Verhoeven", nickname: "sam", color: "var(--label-teal)" },
    ],
    currentUserId: "u1",
    comments: [
      { id: "c1", author: "Sam Verhoeven", authorId: "u2", color: "var(--label-teal)", meta: "2 hours ago", text: "Booked the hangar for **Thursday**. See HE-116.", reactions: [{ emoji: "👍", count: 1, mine: true, by: ["todoi"] }] },
      { id: "c2", author: "todoi", authorId: "u1", color: "var(--label-blue)", meta: "1 hour ago", text: "@sam can you check the delivery dates?", reactions: [] },
    ],
    activity: [{ id: "a1", author: "Sam Verhoeven", meta: "yesterday", text: "moved this item from To do to Doing" }],
    relations: [{ type: "blocked_by", item: PROJECT_ITEMS[3]! }],
    projectItems: PROJECT_ITEMS,
    today: "2026-10-07",
    onClose: fn(),
    onRename: fn(),
    onMoveToList: fn(),
    onSetStatus: fn(),
    onSetPriority: fn(),
    onSetDates: fn(),
    onSetRepeat: fn(),
    onSetLabels: fn(),
    onSetAssignees: fn(),
    onSetCover: fn(),
    onToggleWatch: fn(),
    onSetDescription: fn(),
    onAddSubitem: fn(),
    onToggleSubitem: fn(),
    onReorderSubitem: fn(),
    onDeleteSubitem: fn(),
    onAddRelation: fn(),
    onRemoveRelation: fn(),
    onOpenItem: fn(),
    onOpenKey: fn(),
    onAddComment: fn(),
    onEditComment: fn(),
    onDeleteComment: fn(),
    onReactComment: fn(),
    onMenuAction: fn(),
    onAddFiles: fn(),
    onAttachmentAction: fn(),
  },
  parameters: { docs: { description: { component: "The assembled item-editing modal on Modal: title (click or E to rename), description, subitems, attachments, relations and the activity thread with the composer; the aside carries list, Status, Priority, Dates, Repeat, Labels, Assignees, Cover, Relations and Watch. Every change is the consumer's callback (ItemOverlayScreen wires them to mutations). Comments, files and links arrive separately: pass detailsState \"loading\" or { error, onRetry } until they do, never an empty thread. ctrl+↵ commits whatever is mid-edit and closes." } } },
} satisfies Meta<typeof ItemOverlay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  async play({ canvasElement }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(within(dialog).getByRole("heading", { level: 2, name: "Prepare the helicopter quote" })).toBeVisible();
    await expect(within(dialog).getByRole("button", { name: "Watching" })).toHaveAttribute("aria-pressed", "true");
    await expect(within(dialog).getByText("Blocked", { selector: ".td-relations-blocked" })).toBeVisible();
  },
};
export const DetailsLoading: Story = {
  args: { detailsState: "loading", comments: [], relations: [], item: { ...ITEM, attachments: [], watching: false }, onToggleWatch: undefined },
  async play({ canvasElement }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    const status = within(dialog).getByRole("status");
    await expect(status).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveTextContent("Loading comments, files and links");
  },
};
export const DetailsError: Story = {
  args: { detailsState: { error: "The server didn't answer.", onRetry: retryDetails }, comments: [], relations: [], item: { ...ITEM, attachments: [], watching: false }, onToggleWatch: undefined },
  async play({ canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await expect(within(dialog).getByRole("alert")).toHaveTextContent("Couldn't load comments, files and links. The server didn't answer.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await expect(retryDetails).toHaveBeenCalledOnce();
  },
};
export const RenameTitle: Story = {
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await userEvent.click(within(dialog).getByRole("heading", { level: 2 }));
    const field = within(dialog).getByRole("textbox", { name: "Item title" });
    await expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, "Prepare the H145 quote{Enter}");
    await expect(args.onRename).toHaveBeenCalledWith("Prepare the H145 quote");
  },
};
export const MenuAndClose: Story = {
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Item options" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Archive" }));
    await expect(args.onMenuAction).toHaveBeenCalledWith("archive");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalled();
  },
};
export const SendComment: Story = {
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    const [reply] = within(dialog).getAllByRole("button", { name: "Reply" });
    await userEvent.click(reply!);
    const composer = within(dialog).getByRole("textbox", { name: "Comment" });
    await expect(composer).toHaveValue("@sam ");
    await expect(within(dialog).getByText("Replying to")).toBeVisible();
    await userEvent.type(composer, "the hangar works.{Enter}");
    await expect(args.onAddComment).toHaveBeenCalledWith("@sam the hangar works.", "c1");
    await waitFor(() => expect(composer).toHaveValue(""));
  },
};
export const DarkCover: Story = {
  args: { item: { ...ITEM, cover: { color: "var(--chrome-topbar)" } } },
};
export const ImageCover: Story = {
  args: { item: { ...ITEM, cover: { src: ITEM.attachments![0]!.src, attachmentId: "f1" }, attachments: [{ ...ITEM.attachments![0]!, isCover: true }, ITEM.attachments![1]!] } },
};
export const InboxItem: Story = {
  args: { inbox: true, onMoveToProject: fn(), projects: [{ id: "p1", name: "Helicopters Europe", lists: [{ id: "l1", name: "To do" }] }], item: { ...ITEM, labelIds: [], assigneeIds: [], subitems: [], attachments: [] }, relations: [], comments: [], activity: [] },
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await expect(within(dialog).queryByRole("combobox", { name: "Move to list" })).not.toBeInTheDocument();
    // The aside button opens the ProjectPicker in a popover beside it, not a dialog over the overlay
    await userEvent.click(within(dialog).getByRole("button", { name: "Move to project…" }));
    const picker = await page.findByRole("dialog", { name: "Move to project" });
    await waitFor(() => expect(within(picker).getByRole("combobox", { name: "Search projects…" })).toHaveFocus());
    await userEvent.click(within(picker).getByRole("option", { name: /Helicopters Europe/ }));
    await userEvent.click(within(picker).getByRole("option", { name: "To do" }));
    await expect(args.onMoveToProject).toHaveBeenCalledWith(args.projects![0], { id: "l1", name: "To do" });
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Move to project" })).not.toBeInTheDocument());
  },
};
/** ⋯ › Move to project… / Copy to project… drill into the ProjectPicker inside the same menu (Design: ItemOverlay). */
export const MoveToProjectDrill: Story = {
  args: { onMoveToProject: fn(), onCopyToProject: fn(), projects: [{ id: "p1", name: "Hangar renovation", lists: [{ id: "h1", name: "Backlog" }] }] },
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Item options" }));
    const menu = await page.findByRole("menu", { name: "Item options" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Copy to project…" }));
    const search = within(menu).getByRole("combobox", { name: "Search projects…" });
    await waitFor(() => expect(search).toHaveFocus());
    await expect(page.queryByRole("dialog", { name: "Copy to project" })).not.toBeInTheDocument();
    // Esc steps back to the menu's rows; the overlay stays open
    await userEvent.keyboard("{Escape}");
    // (waitFor: the menu may still be fading in)
    const moveRow = await within(menu).findByRole("menuitem", { name: "Move to project…" });
    await waitFor(() => expect(moveRow).toBeVisible());
    await expect(args.onClose).not.toHaveBeenCalled();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move to project…" }));
    await userEvent.click(await within(menu).findByRole("option", { name: /Hangar renovation/ }));
    await expect(within(menu).getByText("Move to Hangar renovation")).toBeVisible();
    await userEvent.click(within(menu).getByRole("option", { name: "Backlog" }));
    await expect(args.onMoveToProject).toHaveBeenCalledWith(args.projects![0], { id: "h1", name: "Backlog" });
    await expect(args.onCopyToProject).not.toHaveBeenCalled();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
/** ⋯ › Make subitem of… drills into the item picker inside the same menu (Design: ItemOverlay); Esc steps back. */
export const MakeSubitemDrill: Story = {
  args: { onMakeSubitemOf: fn(), item: { ...ITEM, subitems: [] } },
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Item options" }));
    const menu = await page.findByRole("menu", { name: "Item options" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Make subitem of…" }));
    const search = within(menu).getByRole("combobox", { name: "Search items…" });
    await waitFor(() => expect(search).toHaveFocus());
    await waitFor(() => expect(within(menu).getByText("This item moves under the picked item as a subitem; its key stays.")).toBeVisible());
    // The item itself is not a candidate
    await expect(within(menu).queryByRole("option", { name: /HE-115/ })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await within(menu).findByRole("menuitem", { name: "Duplicate" });
    await expect(args.onClose).not.toHaveBeenCalled();
    // → on the drill row opens it again
    within(menu).getByRole("menuitem", { name: "Make subitem of…" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(await within(menu).findByRole("option", { name: /HE-120/ }));
    await expect(args.onMakeSubitemOf).toHaveBeenCalledWith(PROJECT_ITEMS[3]);
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};
/** An item with subitems can't become one: the row is disabled with "has subitems" (the main menu widens for it). */
export const MakeSubitemBlocked: Story = {
  args: { onMakeSubitemOf: fn() },
  async play({ canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Item options" }));
    const row = await page.findByRole("menuitem", { name: /Make subitem of…/ });
    await expect(row).toHaveAttribute("aria-disabled", "true");
    await expect(row).toHaveTextContent("has subitems");
  },
};
/** "Status follows List" on, the item's Status set by its list: the List field moves the item, and Status reads
 * "Doing · set by list" (the suffix quiet). It opens, but only the current Status is enabled; "Change list…" hands over to the List field. */
export const StatusFollowsList: Story = {
  args: { linkStatuses: true, lists: [{ id: "l1", name: "To do", statusRole: "TODO" }, { id: "l2", name: "Doing", statusRole: "DOING" }, { id: "l3", name: "Ideas" }] },
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    const status = within(dialog).getByRole("combobox", { name: "Status: Doing · set by list" });
    await expect(status).toHaveTextContent("Doing · set by list");
    await expect(status).toHaveAttribute("title", "Status · set by the list Doing");
    await userEvent.click(status);
    await expect(await page.findByRole("option", { name: "Done" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(await page.findByRole("button", { name: "Change list…" }));
    await userEvent.click(await page.findByRole("option", { name: "To do" }));
    await expect(args.onMoveToList).toHaveBeenCalledWith("l1");
    await expect(args.onSetStatus).not.toHaveBeenCalled();
  },
};
/** Every visible list has a role: the Status field is hidden and the List field stands for both (its name says the Status). */
export const StatusFollowsListEveryRole: Story = {
  args: { linkStatuses: true, lists: [{ id: "l1", name: "To do", statusRole: "TODO" }, { id: "l2", name: "Doing", statusRole: "DOING" }, { id: "l3", name: "Done", statusRole: "DONE" }] },
  async play({ canvasElement }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await expect(within(dialog).getByRole("combobox", { name: "Move to list. Sets Status, now Doing" })).toBeInTheDocument();
    await expect(within(dialog).queryByRole("combobox", { name: /^Status/ })).not.toBeInTheDocument();
  },
};
/** A Status that differs from the list's role (here None in the Doing list) stays editable, and a pick never moves the item. */
export const StatusFollowsListDiffers: Story = {
  args: { linkStatuses: true, item: { ...ITEM, status: null }, lists: [{ id: "l1", name: "To do", statusRole: "TODO" }, { id: "l2", name: "Doing", statusRole: "DOING" }, { id: "l3", name: "Done", statusRole: "DONE" }] },
  async play({ args, canvasElement, userEvent }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    // No Status assigned: the field reads "No status", and so does the picker's first option
    await expect(within(dialog).getByRole("combobox", { name: "Status" })).toHaveTextContent("No status");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Status" }));
    await expect(await page.findByRole("option", { name: "No status" })).toBeInTheDocument();
    await userEvent.click(await page.findByRole("option", { name: "Done" }));
    await expect(args.onSetStatus).toHaveBeenCalledWith("DONE");
    await expect(args.onMoveToList).not.toHaveBeenCalled();
  },
};
