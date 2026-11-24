import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { changeEmailEmail, escapeHtml, passwordResetEmail, projectInviteEmail, verifyEmailEmail, wrapText } from "./templates";

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
    expect(subjectLine).toBe('Subject: Sam Verhoeven invited you to "Website" on Todoi');
    expect(invite().subject).toBe("Sam Verhoeven invited you to “Website” on Todoi");
  });

  it("give the other three a plain-text part with the same copy in the same order", () => {
    const reset = passwordResetEmail({ email: OLD, url: "https://todoi.com/reset/abc" });
    expect(reset.subject).toBe("Reset your Todoi password");
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
        "Todoi - https://todoi.com - Help: https://todoi.com/help",
        "",
      ].join("\n"),
    );
    const change = changeEmailEmail({ oldEmail: OLD, newEmail: NEW, url: "https://todoi.com/c" });
    expect(change.subject).toBe("Confirm your new email for Todoi");
    expect(change.text).toContain(`Confirm that you want to log in to Todoi with ${NEW} instead of\n${OLD}.`);
    expect(change.text).toContain(`Until you confirm, you log in with ${OLD}. The link expires\nin 24 hours.`);
    const verify = verifyEmailEmail({ email: OLD, url: "https://todoi.com/v" });
    expect(verify.subject).toBe("Confirm your email for Todoi");
    expect(verify.text.split("\n\n").map((block) => block.split("\n")[0])).toEqual(["Confirm your email", `Confirm that ${OLD} is yours to finish setting up your`, "Confirm your email:", "The link expires in 24 hours.", "Didn't create a Todoi account? Ignore this email and no account is set up.", "--"]);
  });

  it("escape every variable in the HTML and keep the text part literal", () => {
    const evil = invite({ inviterName: `Eve <script>alert("x")</script>`, projectName: "R&D <b>", message: "Click <a href='x'>here</a>", email: "a&b@example.com", url: 'https://todoi.com/i/x"onmouseover="y' });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).not.toContain("<b>R&D");
    expect(evil.html).toContain("Eve &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; invited you to R&amp;D &lt;b&gt;");
    expect(evil.html).toContain("&ldquo;Click &lt;a href=&#39;x&#39;&gt;here&lt;/a&gt;&rdquo;");
    expect(evil.html).toContain('href="https://todoi.com/i/x&quot;onmouseover=&quot;y"');
    expect(evil.html).toContain("The invitation is for a&amp;b@example.com");
    expect(evil.subject).toBe(`Eve <script>alert("x")</script> invited you to “R&D <b>” on Todoi`);
    expect(evil.text).toContain(`    "Click <a href='x'>here</a>"`);
  });

  it("keep names on one line and drop the quote without a message", () => {
    const e = invite({ inviterName: "Sam\r\nBcc: someone@example.com", message: "  " });
    expect(e.subject).toBe("Sam Bcc: someone@example.com invited you to “Website” on Todoi");
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
