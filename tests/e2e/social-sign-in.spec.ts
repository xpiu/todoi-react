// Social sign-in (work plan R9): the log-in and sign-up pages show Continue with GitHub and Google, disabled
// with a warning line, because both providers are switched off until the lead developer sets up their OAuth
// apps (shared/socialSignIn.ts). The server refuses them too.
import { expect, test } from "@playwright/test";

import { useScope, type Scope } from "./helpers";

for (const scope of ["rounded-light", "minimal-dark"] as Scope[]) {
  test(`shows GitHub and Google as temporarily unavailable in ${scope}`, async ({ page }) => {
    await useScope(page, scope);
    for (const path of ["/login", "/signup"]) {
      await page.goto(path);
      for (const name of ["GitHub", "Google"]) {
        const button = page.getByRole("button", { name: `Continue with ${name}` });
        await expect(button).toBeDisabled();
        await expect(button).toHaveAccessibleDescription(`${name} login temporarily unavailable`);
        await expect(page.getByText(`${name} login temporarily unavailable`)).toBeVisible();
      }
      await page.screenshot({ path: `.tmp/shots/social-sign-in${path.replace("/", "-")}-${scope}.png`, fullPage: true });
    }
  });
}

test("the server registers no social provider while they are switched off", async ({ request }) => {
  const r = await request.post("/api/auth/sign-in/social", { data: { provider: "github", callbackURL: "/" } });
  expect(r.status()).toBe(404);
  expect(((await r.json()) as { code: string }).code).toBe("PROVIDER_NOT_FOUND");
});
