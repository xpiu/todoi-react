// The QA note tool (src/client/qa): todoi's own people (@todoi.com) summon it with Ctrl+Shift+F on any
// screen, draw on a still of the screen, write what is wrong and submit; nobody else gets it. The request
// is answered here instead of by the API, so a run never stores a note or sends an email (the API's side is
// covered by src/server/routes/qaReports.integration.test.ts).
import { expect, test, type Page, type Request } from "@playwright/test";

import { DEV_USER } from "../../src/shared/devUser";
import { signIn } from "./helpers";

/** The seed's own @todoi.com sign-in (src/server/seed.ts › ensureDevAccounts). */
const STAFF = { email: "flo@todoi.com", password: DEV_USER.password };
const SHORTCUT = "Control+Shift+F";

async function openAsStaff(page: Page) {
  expect((await page.request.post("/api/auth/sign-in/email", { data: STAFF })).ok(), "staff sign-in").toBeTruthy();
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
}

/** The parts of the multipart body a QA note is sent as. */
function partsOf(request: Request) {
  const boundary = /boundary=(.+)$/.exec(request.headers()["content-type"] ?? "")?.[1];
  const body = request.postDataBuffer();
  if (!boundary || !body) throw new Error("not a multipart request");
  const parts = new Map<string, Buffer>();
  const mark = Buffer.from(`--${boundary}`);
  for (let at = body.indexOf(mark); at >= 0; ) {
    const next = body.indexOf(mark, at + mark.length);
    if (next < 0) break;
    const part = body.subarray(at + mark.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const name = /name="([^"]+)"/.exec(part.subarray(0, split).toString())?.[1];
    if (name) parts.set(name, part.subarray(split + 4));
    at = next;
  }
  return parts;
}

test("todoi's own people draw on the screen, write a note and submit it", async ({ page }) => {
  let sent: Request | undefined;
  await page.route("**/api/qa-reports", async (route) => {
    sent = route.request();
    await route.fulfill({ status: 201, json: { id: "AAAAAAAAAAAAAAAAAAAAA" } });
  });
  await openAsStaff(page);
  await expect(page.locator(".td-qa")).toHaveCount(0);

  await page.keyboard.press(SHORTCUT);
  const panel = page.getByRole("dialog", { name: "QA note" });
  await expect(panel).toBeVisible();
  // The note field takes focus once the screen is frozen; the pencil is the cursor everywhere but the panel.
  const note = panel.getByRole("textbox", { name: "What is wrong" });
  await expect(note).toBeFocused();
  const ink = page.locator(".td-qa-ink");
  expect(await ink.evaluate((el) => getComputedStyle(el).cursor)).toMatch(/^url\("data:image\/svg\+xml,.+"\) 2 22, crosshair$/);
  expect(await panel.evaluate((el) => getComputedStyle(el).cursor)).toBe("default");
  expect(await ink.evaluate((el) => new Promise<number>((done) => { const img = new Image(); img.onload = () => done(img.naturalWidth); img.onerror = () => done(0); img.src = /url\("(.+?)"\)/.exec(getComputedStyle(el).cursor)![1]!.replace(/\\"/g, '"'); }))).toBe(24);

  // An arrow-ish stroke across the page; drawing keeps the focus in the note.
  await page.mouse.move(300, 320);
  await page.mouse.down();
  await page.mouse.move(380, 300, { steps: 6 });
  await page.mouse.move(460, 340, { steps: 6 });
  await page.mouse.up();
  await expect(panel.getByRole("button", { name: "Undo the last stroke" })).toBeEnabled();
  const red = await ink.evaluate((el: HTMLCanvasElement) => { const scale = el.width / innerWidth; return [...el.getContext("2d")!.getImageData(Math.round(380 * scale), Math.round(300 * scale), 1, 1).data]; });
  expect(red.slice(0, 3)).toEqual([255, 31, 31]);
  await expect(note).toBeFocused();

  // The app's own keys (? opens the shortcuts, N adds an item) are just letters here.
  await page.keyboard.type("Why is this empty? No hint");
  await expect(note).toHaveValue("Why is this empty? No hint");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);

  await panel.getByRole("button", { name: "Submit" }).click();
  await expect(panel.getByRole("status")).toHaveText("Sent");
  await expect(panel).toHaveCount(0);

  const parts = partsOf(sent!);
  expect(parts.get("text")!.toString()).toBe("Why is this empty? No hint");
  const context = JSON.parse(parts.get("context")!.toString()) as { url: string; strokes: number; viewport: { width: number; height: number }; userAgent: string; capture: { ok: boolean }; marked: Array<{ selector: string }>; appearance: Record<string, string> };
  expect(context).toMatchObject({ strokes: 1, viewport: { width: 1280, height: 800 }, capture: { ok: true } });
  expect(context.url).toMatch(/\/projects$/);
  expect(context.userAgent).toContain("Chrome");
  expect(context.appearance.theme).toBeTruthy();
  expect(context.marked.length).toBeGreaterThan(0);
  expect(context.marked.every((m) => !m.selector.includes("td-qa"))).toBe(true);
  // A PNG of exactly the viewport: signature, then IHDR's width and height.
  const png = parts.get("screenshot")!;
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1280, 800]);
  expect(png.byteLength).toBeGreaterThan(5000);

  // Sent notes leave nothing behind for the next one.
  await page.keyboard.press(SHORTCUT);
  await expect(note).toHaveValue("");
  await expect(panel.getByRole("button", { name: "Undo the last stroke" })).toBeDisabled();
});

test("hiding keeps the draft, the panel moves, and Use the app lets clicks through", async ({ page }) => {
  await openAsStaff(page);
  // Summoned while typing in a field: the field keeps its text and its caret (on macOS the keys alone would
  // extend the selection).
  const search = page.locator('.td-topnav input[aria-label="Search"]');
  await search.click();
  await page.keyboard.type("heli");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press(SHORTCUT);
  const panel = page.getByRole("dialog", { name: "QA note" });
  await expect(panel).toBeVisible();
  expect(await search.evaluate((el: HTMLInputElement) => [el.value, el.selectionStart, el.selectionEnd])).toEqual(["heli", 3, 3]);
  const note = panel.getByRole("textbox", { name: "What is wrong" });
  await expect(note).toBeFocused();
  await page.keyboard.type("Half a thought");

  // Esc in the note hides the tool; the shortcut brings it back as it was.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press(SHORTCUT);
  await expect(note).toHaveValue("Half a thought");

  // Dragged by its title bar; it cannot leave the viewport.
  const before = (await panel.boundingBox())!;
  await page.mouse.move(before.x + 40, before.y + 14);
  await page.mouse.down();
  await page.mouse.move(before.x - 260, before.y - 286, { steps: 5 });
  await page.mouse.up();
  const moved = (await panel.boundingBox())!;
  expect([Math.round(moved.x - before.x), Math.round(moved.y - before.y)]).toEqual([-300, -300]);
  await page.mouse.move(moved.x + 40, moved.y + 14);
  await page.mouse.down();
  await page.mouse.move(-500, -500, { steps: 3 });
  await page.mouse.up();
  expect(await panel.boundingBox()).toMatchObject({ x: 0, y: 0 });

  // While drawing, the page under the still cannot be clicked; in "Use the app" it can, and the tool stays.
  await page.mouse.click(700, 500);
  await expect(panel.getByRole("button", { name: "Undo the last stroke" })).toBeEnabled();
  await panel.getByRole("button", { name: "Use the app" }).click();
  await page.getByRole("button", { name: /^Inbox — / }).click();
  await expect(page).toHaveURL(/\/inbox/);
  await expect(panel).toBeVisible();
  await expect(note).toHaveValue("Half a thought");

  // An empty note is not sent.
  await panel.getByRole("button", { name: "Clear the drawing" }).click();
  await note.fill("");
  await panel.getByRole("button", { name: "Submit" }).click();
  await expect(panel.getByRole("alert")).toHaveText("Write what is wrong, or draw on the screen.");
});

test("Exact capture swaps the still for the tab's real pixels", async ({ page }) => {
  let sent: Request | undefined;
  await page.route("**/api/qa-reports", async (route) => {
    sent = route.request();
    await route.fulfill({ status: 201, json: { id: "AAAAAAAAAAAAAAAAAAAAA" } });
  });
  // The browser's prompt can't be answered here: the share is a green canvas of the viewport's shape instead.
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = innerWidth;
      canvas.height = innerHeight;
      const ctx = canvas.getContext("2d")!;
      const fill = () => {
        ctx.fillStyle = "rgb(0, 200, 0)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      };
      fill();
      setInterval(fill, 50);
      return canvas.captureStream(30);
    };
  });
  await openAsStaff(page);
  await page.keyboard.press(SHORTCUT);
  const panel = page.getByRole("dialog", { name: "QA note" });
  await expect(panel.getByRole("textbox", { name: "What is wrong" })).toBeFocused();
  const pixel = () => page.locator(".td-qa-ink").evaluate((el: HTMLCanvasElement) => [...el.getContext("2d")!.getImageData(5, 5, 1, 1).data].slice(0, 3));
  expect(await pixel()).not.toEqual([0, 200, 0]);
  await panel.getByRole("button", { name: "Capture the screen exactly" }).click();
  await expect.poll(pixel).toEqual([0, 200, 0]);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "What is wrong" })).toBeFocused();
  // Chrome's sharing bar comes and goes with resize events of its own: they must not bring back the re-rendered still.
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(500);
  expect(await pixel()).toEqual([0, 200, 0]);

  await page.keyboard.type("Exact");
  await panel.getByRole("button", { name: "Submit" }).click();
  await expect(panel).toHaveCount(0);
  const context = JSON.parse(partsOf(sent!).get("context")!.toString()) as { capture: { ok: boolean; method: string } };
  expect(context.capture).toMatchObject({ ok: true, method: "screen" });
});

test("the operator console lists QA notes with their screenshot and resolves them", async ({ page }) => {
  const note = { id: "BBBBBBBBBBBBBBBBBBBBB", createdAt: new Date().toISOString(), emailedAt: new Date().toISOString(), resolvedAt: null as string | null, email: STAFF.email, name: "Flo", text: "The Add button jumps", url: "http://localhost:5173/inbox?item=1", marked: ["div.td-card > button.td-btn"], screenshot: "/api/qa-reports/BBBBBBBBBBBBBBBBBBBBB/screenshot" };
  let resolved = false;
  await page.route("**/api/qa-reports", (route) => route.fulfill({ json: [{ ...note, resolvedAt: resolved ? new Date().toISOString() : null }] }));
  await page.route("**/api/qa-reports/*/resolve", async (route) => {
    resolved = true;
    await route.fulfill({ status: 204 });
  });
  // A 1x1 PNG stands in for the stored screenshot.
  await page.route("**/api/qa-reports/*/screenshot", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
  await signIn(page);
  await page.goto("/admin");
  const card = page.getByRole("region", { name: "QA notes" }).or(page.locator("section, div").filter({ has: page.getByRole("heading", { name: "QA notes" }) }).last());
  await expect(page.getByText("The Add button jumps")).toBeVisible();
  await expect(page.getByText("1 open note")).toBeVisible();
  await expect(page.getByText(/Flo · \/inbox\?item=1 · /)).toBeVisible();
  await page.getByRole("button", { name: "Show the screenshot" }).click();
  await expect(page.getByRole("img", { name: "The screenshot with its drawing" })).toBeVisible();
  await expect(page.getByText("div.td-card > button.td-btn")).toBeVisible();
  await card.getByRole("button", { name: "Resolve" }).last().click();
  await expect(page.getByText("Nothing open").first()).toBeVisible();
  expect(resolved).toBe(true);
});

test("other accounts get no QA tool", async ({ page }) => {
  await signIn(page);
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await page.keyboard.press(SHORTCUT);
  await page.waitForTimeout(400);
  await expect(page.locator(".td-qa")).toHaveCount(0);
});
