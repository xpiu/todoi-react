import { expect, test, type Page } from "@playwright/test";

import { signIn, trackAccounts } from "./helpers";

// The Inbox end to end in a fresh guest workspace (an empty Inbox and one project to file into):
// capture, open and edit, file into a chosen list, undo, delete and restore — by keyboard and pointer.
trackAccounts(test);

const inboxRow = (page: Page, title: string) => page.locator(".td-lrow", { hasText: title });
const toast = (page: Page) => page.getByRole("status").filter({ hasText: /./ }).last();
const shot = (page: Page, name: string) => page.screenshot({ path: `.tmp/shots/inbox-${name}.png` });

async function freshInbox(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/p\//);
  await page.goto("/inbox");
  await expect(page.getByText("Your inbox is empty")).toBeVisible();
}

test("capture, edit, file into a chosen list, undo, and delete/restore without dragging", async ({ page }) => {
  await freshInbox(page);
  await shot(page, "empty");

  // Create › Item lands in the Inbox with the quick-add field focused.
  await page.goto("/projects");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("menuitem", { name: "Create an item" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  const capture = page.getByRole("textbox", { name: /New item in Inbox/ });
  await expect(capture).toBeFocused();
  await capture.fill("Call the hangar");
  await capture.press("Enter");
  await capture.press("Escape");
  await expect(inboxRow(page, "Call the hangar")).toBeVisible();

  // Open by keyboard, rename, set a priority.
  await inboxRow(page, "Call the hangar").focus();
  await page.keyboard.press("Enter");
  const overlay = page.getByRole("dialog", { name: "Call the hangar" });
  await expect(overlay).toBeVisible();
  await expect(page).toHaveURL(/\/inbox\?item=/);
  // Project-only pickers are not offered; filing is.
  await expect(overlay.getByRole("button", { name: "Move to list" })).toHaveCount(0);
  await expect(overlay.getByRole("button", { name: "Move to project…" })).toBeVisible();
  await overlay.getByRole("heading").click();
  await overlay.getByRole("textbox", { name: "Item title" }).fill("Call the hangar about the rotor");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Call the hangar about the rotor" })).toBeVisible();
  await shot(page, "overlay");

  // File into a chosen list with the explicit action.
  const dialog = page.getByRole("dialog", { name: "Call the hangar about the rotor" });
  await dialog.getByRole("button", { name: "Move to project…" }).click();
  const picker = page.getByRole("dialog", { name: "Move to project" });
  await expect(picker).toBeVisible();
  await shot(page, "picker");
  await picker.getByRole("option").first().click();
  const list = picker.getByRole("listbox", { name: /^Lists in/ }).getByRole("option").last();
  await expect(list).toBeVisible();
  const listName = (await list.innerText()).trim();
  await list.click();
  await expect(toast(page)).toContainText(`Moved “Call the hangar about the rotor” to`);
  await expect(toast(page)).toContainText(listName);
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(inboxRow(page, "Call the hangar about the rotor")).toHaveCount(0);
  await shot(page, "filed");

  // Undo brings it back to the Inbox.
  await toast(page).getByRole("button", { name: /^Undo/ }).click();
  await expect(inboxRow(page, "Call the hangar about the rotor")).toBeVisible();

  // Delete with ⌫ on the focused row; Undo restores it.
  await inboxRow(page, "Call the hangar about the rotor").focus();
  await page.keyboard.press("Backspace");
  await expect(toast(page)).toContainText("Deleted “Call the hangar about the rotor”");
  await expect(inboxRow(page, "Call the hangar about the rotor")).toHaveCount(0);
  await toast(page).getByRole("button", { name: /^Undo/ }).click();
  await expect(inboxRow(page, "Call the hangar about the rotor")).toBeVisible();
  // Reload: the restore is real.
  await page.reload();
  await expect(inboxRow(page, "Call the hangar about the rotor")).toBeVisible();
});

test("dragging an Inbox row onto a sidebar project files it there", async ({ page }) => {
  await freshInbox(page);
  const projectName = (await (await page.request.get("/api/groups")).json())[0].projects[0].name as string;
  await page.getByRole("button", { name: "Add an item" }).first().click();
  const capture = page.getByRole("textbox", { name: /New item in Inbox/ });
  await capture.fill("Order spare blades");
  await capture.press("Enter");
  await capture.press("Escape");
  await expect(inboxRow(page, "Order spare blades")).toBeVisible();
  await inboxRow(page, "Order spare blades").dragTo(page.locator(".td-sidebar").getByText(projectName, { exact: true }));
  await expect(toast(page)).toContainText(`Moved “Order spare blades” to ${projectName} ›`);
  await expect(inboxRow(page, "Order spare blades")).toHaveCount(0);
  await expect(page.getByText("Your inbox is empty")).toBeVisible();
});

test("a notification's key opens the item it is about and reads it", async ({ page }) => {
  await signIn(page);
  const inbox = (await (await page.request.get("/api/items")).json()) as Array<{ id: string; unread: boolean; notification: { aboutKey?: string } | null }>;
  const note = inbox.find((it) => it.unread && it.notification?.aboutKey);
  test.skip(!note, "no unread notification about an item in the seed");
  try {
    await page.goto("/inbox");
    const about = page.locator(`[data-drag-id="${note!.id}"] .td-lrow-about`);
    await expect(about).toHaveText(note!.notification!.aboutKey!);
    await about.click();
    await expect(page).toHaveURL(/\/p\/[^?]+\?item=/);
    await expect(page.getByRole("dialog")).toContainText(note!.notification!.aboutKey!);
    await expect.poll(async () => ((await (await page.request.get("/api/items")).json()) as typeof inbox).find((it) => it.id === note!.id)?.unread).toBe(false);
  } finally {
    // Leave the seeded notification as it was.
    await page.request.patch(`/api/items/${note!.id}`, { data: { unread: true } });
  }
});
