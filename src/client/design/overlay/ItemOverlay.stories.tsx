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
      { id: "u1", name: "Flo Zuallaert", color: "var(--label-blue)" },
      { id: "u2", name: "Sam Verhoeven", nickname: "sam", color: "var(--label-teal)" },
    ],
    currentUserId: "u1",
    comments: [
      { id: "c1", author: "Sam Verhoeven", authorId: "u2", color: "var(--label-teal)", meta: "2 hours ago", text: "Booked the hangar for **Thursday**. See HE-116.", reactions: [{ emoji: "👍", count: 1, mine: true, by: ["Flo Zuallaert"] }] },
      { id: "c2", author: "Flo Zuallaert", authorId: "u1", color: "var(--label-blue)", meta: "1 hour ago", text: "@sam can you check the delivery dates?", reactions: [] },
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
    await expect(within(dialog).getByText("Blocked", { selector: ".td-rel-blocked" })).toBeVisible();
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
  async play({ canvasElement }) {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Prepare the helicopter quote" });
    await expect(within(dialog).getByRole("button", { name: "Move to project…" })).toBeVisible();
    await expect(within(dialog).queryByRole("combobox", { name: "Move to list" })).not.toBeInTheDocument();
  },
};
