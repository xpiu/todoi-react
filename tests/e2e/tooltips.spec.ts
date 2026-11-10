import { expect, test } from "@playwright/test";

import { checkA11y, freshProject, SCOPES, signIn, useScope } from "./helpers";

for (const scope of SCOPES) test(`styled connection and unclipped picker hints in ${scope}`, async ({ page, context }) => {
  await useScope(page, scope);
  await signIn(page);
  const f = await freshProject(page, "Picker hints");
  try {
    if (scope === "minimal-light") await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/p/${f.projectId}?v=list`);
    await page.getByRole("button", { name: "List actions for To-do" }).click();
    await page.getByRole("menuitem", { name: "Icon", exact: true }).click();
    await page.getByRole("button", { name: "More icons", exact: true }).click();
    const tiles = page.locator(".td-ipk-body .td-ipk-opt");
    const last = tiles.last();
    await last.scrollIntoViewIfNeeded();
    await last.hover();
    const name = await last.getAttribute("aria-label");
    const hint = page.locator(".td-tip-popup").filter({ hasText: name! });
    await expect(hint).toBeVisible();
    await expect(last).not.toHaveAttribute("title");
    expect(await hint.evaluate((element) => !!element.closest(".td-ipk-body"))).toBe(false);
    const body = await page.locator(".td-ipk-body").boundingBox();
    const box = await hint.boundingBox();
    expect(box!.y + box!.height > body!.y + body!.height || box!.x < body!.x || box!.x + box!.width > body!.x + body!.width).toBe(true);
    await page.screenshot({ path: `.tmp/tooltips/${scope}-scroll-edge.png` });
    // Keyboard navigation still reaches the last tile, and choosing it keeps the original handler.
    await tiles.first().focus();
    await page.keyboard.press("End");
    await expect(last).toBeFocused();
    await expect(hint).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".td-ipk")).toHaveCount(0);
    await expect(hint).toHaveCount(0);
    await context.setOffline(true);
    const pill = page.getByRole("button", { name: "You're offline", exact: true });
    await expect(pill).toBeVisible();
    await expect(pill).not.toHaveAttribute("title");
    await pill.hover();
    await expect.poll(() => pill.evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("1");
    expect(await pill.evaluate((el) => getComputedStyle(el, "::after").content)).toBe('"You\'re offline"');
    await pill.click();
    await expect(pill).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => pill.evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("0");
    await page.keyboard.press("Escape");
    await context.setOffline(false);
    // Minimal shows no project icons in Project settings; the New project dialog keeps its picker in every theme.
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.getByRole("button", { name: "Change icon and color" }).first().click();
    const swatch = page.getByRole("radio", { name: "blue", exact: true });
    await page.mouse.move(1, 1);
    await swatch.hover();
    const modalHint = page.locator(".td-tip-popup").filter({ hasText: "Blue" });
    await expect(modalHint).toBeVisible();
    expect(await modalHint.evaluate((el) => !!el.closest('.td-dialog'))).toBe(true);
    expect(await modalHint.evaluate((el) => !!el.parentElement?.closest('[aria-hidden="true"], [inert]'))).toBe(false);
    await checkA11y(page, `${scope} picker hints`);
    await page.screenshot({ path: `.tmp/tooltips/${scope}-dialog.png` });
  } finally { await context.setOffline(false); await f.cleanup(); }
});
