import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { changeEmailEmail, escapeHtml, notificationEmail, passwordResetEmail, projectInviteEmail, verifyEmailEmail, wrapText } from "./templates";

const sample = (name: string) => readFileSync(new URL(`./samples/${name}`, import.meta.url), "utf8");
const OLD = "flo@helicopterseurope.com";
const NEW = "flo@todoi.com";
const invite = (over: Partial<Parameters<typeof projectInviteEmail>[0]> = {}) =>
  projectInviteEmail({ email: OLD, inviterName: "Sam Verhoeven", inviterEmail: "sam@helicopterseurope.com", projectName: "Website", role: "editor", message: "The shop and the public pages for both dealers. You take the pages.", url: "https://todoi.com/invite/2e6a94f0b1c7d538", expiresAt: new Date("2026-12-08T10:00:00Z"), ...over });

describe("account emails", () => {
  it("reproduce Design's four HTML files with their sample values", () => {
    expect(passwordResetEmail({ email: OLD, url: "https://todoi.com/reset/9f2c41e8b7d04a61" }).html).toBe(sample("password-reset.html"));
    expect(verifyEmailEmail({ email: OLD, url: "https://todoi.com/verify/4b81e0c35a9f27d6" }).html).toBe(sample("verify-email.html"));
    expect(changeEmailEmail({ oldEmail: OLD, newEmail: NEW, url: "https://todoi.com/confirm-email/c07d59a1e3b84f62" }).html).toBe(sample("change-email.html"));
    expect(invite().html).toBe(sample("project-invite.html"));
  });

  it("give the invite the plain-text part Design wrote, and its subject", () => {
    const [subjectLine, blank, ...body] = sample("project-invite.txt").split("\n");
    expect(blank).toBe("");
    expect(body.join("\n")).toBe(invite().text);
    expect(subjectLine).toBe('Subject: Sam Verhoeven invited you to "Website" on todoi');
    expect(invite().subject).toBe("Sam Verhoeven invited you to “Website” on todoi");
  });

  it("give the other three a plain-text part with the same copy in the same order", () => {
    const reset = passwordResetEmail({ email: OLD, url: "https://todoi.com/reset/abc" });
    expect(reset.subject).toBe("Reset your todoi password");
    expect(reset.text).toBe(
      [
        "Reset your password",
        "",
        `We got a request to reset the password for ${OLD}.`,
        "",
        "Set a new password:",
        "https://todoi.com/reset/abc",
        "",
        "The link works once and expires in 1 hour.",
        "",
        "Didn't ask for this? Ignore this email. Your password stays the same.",
        "",
        "--",
        "You got this email because someone asked to reset the password for this",
        "address.",
        "todoi - https://todoi.com - Contact: https://todoi.com/contact",
        "",
      ].join("\n"),
    );
    const change = changeEmailEmail({ oldEmail: OLD, newEmail: NEW, url: "https://todoi.com/c" });
    expect(change.subject).toBe("Confirm your new email for todoi");
    expect(change.text).toContain(`Confirm that you want to log in to todoi with ${NEW} instead of\n${OLD}.`);
    expect(change.text).toContain(`Until you confirm, you log in with ${OLD}. The link expires\nin 24 hours.`);
    const verify = verifyEmailEmail({ email: OLD, url: "https://todoi.com/v" });
    expect(verify.subject).toBe("Confirm your email for todoi");
    expect(verify.text.split("\n\n").map((block) => block.split("\n")[0])).toEqual(["Confirm your email", `Confirm that ${OLD} is yours to finish setting up your`, "Confirm your email:", "The link expires in 24 hours.", "Didn't create a todoi account? Ignore this email and no account is set up.", "--"]);
  });

  it("escape every variable in the HTML and keep the text part literal", () => {
    const evil = invite({ inviterName: `Eve <script>alert("x")</script>`, projectName: "R&D <b>", message: "Click <a href='x'>here</a>", email: "a&b@example.com", url: 'https://todoi.com/i/x"onmouseover="y' });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).not.toContain("<b>R&D");
    expect(evil.html).toContain("Eve &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; invited you to R&amp;D &lt;b&gt;");
    expect(evil.html).toContain("&ldquo;Click &lt;a href=&#39;x&#39;&gt;here&lt;/a&gt;&rdquo;");
    expect(evil.html).toContain('href="https://todoi.com/i/x&quot;onmouseover=&quot;y"');
    expect(evil.html).toContain("The invitation is for a&amp;b@example.com");
    expect(evil.subject).toBe(`Eve <script>alert("x")</script> invited you to “R&D <b>” on todoi`);
    expect(evil.text).toContain(`    "Click <a href='x'>here</a>"`);
  });

  it("keep names on one line and drop the quote without a message", () => {
    const e = invite({ inviterName: "Sam\r\nBcc: someone@example.com", message: "  " });
    expect(e.subject).toBe("Sam Bcc: someone@example.com invited you to “Website” on todoi");
    expect(e.html).not.toContain("&ldquo;");
    expect(e.text).not.toContain('    "');
  });

  it("name the role and what it allows", () => {
    expect(invite({ role: "viewer" }).text).toContain("You'll join the project Website as a Viewer: you can open everything but\nchange nothing.");
    expect(invite({ role: "admin" }).html).toContain("as an <b>Admin</b>: you can add and change items, and manage members and settings.");
  });
});

describe("text helpers", () => {
  it("escape the five HTML specials", () => expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"));
  it("wrap at 78 columns and keep long words whole", () => {
    expect(wrapText("a ".repeat(50).trim()).split("\n").map((l) => l.length)).toEqual([77, 21]);
    expect(wrapText(`see ${"x".repeat(90)} now`)).toBe(`see\n${"x".repeat(90)}\nnow`);
    expect(wrapText("one two", 78, "    ")).toBe("    one two");
  });
});

describe("notification emails (R10)", () => {
  const base = { actorName: "Sam Verhoeven", itemKey: "WEB-7", itemTitle: "Order blades", projectName: "Website", url: "https://todoi.com/epd5vjxy38?item=WEB-7", settingsUrl: "https://todoi.com/settings?s=notifications" };

  it("use the Inbox item's title as the subject and link to the item", () => {
    const assigned = notificationEmail({ ...base, kind: "assignment" });
    expect(assigned.subject).toBe("Sam Verhoeven assigned WEB-7 to you: Order blades");
    expect(assigned.text).toContain("Sam Verhoeven assigned WEB-7: Order blades to you in Website.");
    expect(assigned.text).toContain("Open the item:\nhttps://todoi.com/epd5vjxy38?item=WEB-7");
    expect(assigned.text.replace(/\s+/g, " ")).toContain("Turn off Assignments under Settings › Notifications › Email notifications (https://todoi.com/settings?s=notifications).");
    expect(assigned.html).toContain('<a class="link" href="https://todoi.com/settings?s=notifications" style="color:#111111;text-decoration:underline;">Settings › Notifications › Email notifications</a>');
    expect(assigned.html).toContain('href="https://todoi.com/epd5vjxy38?item=WEB-7"');
    expect(notificationEmail({ ...base, itemKey: null, kind: "assignment" }).subject).toBe("Sam Verhoeven assigned an item to you: Order blades");
    expect(notificationEmail({ ...base, kind: "mention", excerpt: "x" }).subject).toBe("Sam Verhoeven mentioned you on WEB-7: Order blades");
    expect(notificationEmail({ ...base, kind: "watch", excerpt: "x" }).subject).toBe("Sam Verhoeven commented on WEB-7: Order blades");
  });

  it("quote the comment on one line, shortened, escaped in HTML", () => {
    const long = `@flo <b>look</b>\n\n${"word ".repeat(200)}`;
    const mail = notificationEmail({ ...base, kind: "mention", excerpt: long });
    expect(mail.html).toContain("&lt;b&gt;look&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>look</b>");
    expect(mail.text).toMatch(/"@flo <b>look<\/b> word[^"]*…"/);
    // The sentence above the quote names the author; no name under it, and only the item is bold.
    expect(mail.text).not.toContain("    Sam Verhoeven");
    expect(mail.html).toContain("Sam Verhoeven mentioned you in a comment on <b>WEB-7: Order blades</b> in Website:</p>");
    // An assignment has no comment to quote.
    expect(notificationEmail({ ...base, kind: "assignment", excerpt: "ignored" }).text).not.toContain("ignored");
  });

  it("wrap a long link inside the card and end the inbox preview at the preheader", () => {
    const mail = notificationEmail({ ...base, kind: "assignment" });
    expect(mail.html).toContain('color:#55555a;text-decoration:underline;word-break:break-all;">https://todoi.com/epd5vjxy38?item=WEB-7</a>');
    expect(mail.html).toContain('padding:32px 32px 20px;word-break:break-word;"');
    expect(mail.html).toMatch(/Open WEB-7: Order blades in Website\.(&#847;&zwnj;&nbsp;){90}<\/span>/);
    expect(mail.html).toContain('<a class="link" href="https://todoi.com/contact"');
  });

  it("put no expiry line in, unlike the account emails", () => {
    const mail = notificationEmail({ ...base, kind: "assignment" });
    expect(mail.text).not.toMatch(/expires/);
    // Without the caption the button keeps its full space above the rule.
    expect(mail.html).toContain('style="margin:8px 0 24px;"><tr><td class="btn"');
    expect(passwordResetEmail({ email: OLD, url: "https://todoi.com/reset/abc" }).html).toContain('style="margin:8px 0 12px;"><tr><td class="btn"');
  });
});
