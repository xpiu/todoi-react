// The account emails Claude Design drew (emails/*.html in the design system; copies in ./samples): one
// neutral style for every recipient, tables for layout, every style inline, a hidden preheader and a
// <style> block that only adds dark mode and phone padding. Each render fills the variables (escaped)
// and returns the subject, the HTML and a plain-text part with the same copy in the same order as
// Design's project-invite.txt. The sample values in ./samples reproduce Design's files byte for byte
// (templates.test.ts). Pure: no environment, no I/O.
import type { MemberRole } from "../../shared/enums";
import { EMAIL_LINK_HOURS, linkSpan, RESET_LINK_MINUTES } from "../../shared/accountLinks";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Literal hex values: an email can't read the app's tokens. */
const FONT = "Helvetica,Arial,sans-serif";
const SITE = "https://todoi.com";
const HELP = "https://todoi.com/help";
const TEXT_WIDTH = 78;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
/** Names and addresses are one line: no breaks smuggled into a subject or a sentence. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Copy is trusted text; `v` marks a variable (escaped in HTML), `b` a bold variable. */
type Piece = string | { v: string; bold?: boolean };
const v = (value: string): Piece => ({ v: oneLine(value) });
const b = (value: string): Piece => ({ v: oneLine(value), bold: true });
const html = (pieces: Piece[]) => pieces.map((p) => (typeof p === "string" ? p : p.bold ? `<b>${escapeHtml(p.v)}</b>` : escapeHtml(p.v))).join("");
const plain = (pieces: Piece[]) => pieces.map((p) => (typeof p === "string" ? p : p.v)).join("");

interface EmailContent {
  /** <title> and the subject line */
  subject: Piece[];
  preheader: Piece[];
  heading: Piece[];
  intro: Piece[];
  /** The inviter's own words, quoted with their name under them */
  quote?: { message: string; by: string };
  button: string;
  /** The plain-text line above the link ("Open the invitation:") */
  linkLead: string;
  url: string;
  /** When the link stops working; notification emails link to the item and leave it out */
  expiry?: Piece[];
  ignore: Piece[];
  /** Why the email came, before the todoi.com · Help line */
  footer: Piece[];
}

const P_INK = `<p class="ink" style="margin:0 0 16px;font:16px/24px ${FONT};color:#111111;mso-line-height-rule:exactly;">`;
const P_DIM = `<p class="dim" style="margin:0 0 12px;font:14px/20px ${FONT};color:#55555a;mso-line-height-rule:exactly;">`;
const LINK_STYLE = "color:#111111;text-decoration:underline;";
const TABLE = `role="presentation" cellpadding="0" cellspacing="0" border="0"`;

function renderHtml(c: EmailContent): string {
  const url = escapeHtml(c.url);
  const quote = c.quote
    ? `<table ${TABLE} width="100%" style="margin:0 0 16px;"><tr><td class="quote ink" style="padding:4px 0 4px 14px;border-left:2px solid #8a8a8f;font:16px/24px ${FONT};color:#111111;mso-line-height-rule:exactly;">&ldquo;${escapeHtml(oneLine(c.quote.message))}&rdquo;<br><span class="dim" style="font:14px/20px ${FONT};color:#55555a;">${escapeHtml(oneLine(c.quote.by))}</span></td></tr></table>`
    : "";
  const body = [
    `${P_INK}${html(c.intro)}</p>`,
    quote,
    `<table ${TABLE} style="margin:8px 0 24px;"><tr><td class="btn" bgcolor="#111111" style="background:#111111;border-radius:2px;"><a href="${url}" style="display:block;padding:12px 24px;font:bold 16px/24px ${FONT};color:#ffffff;text-decoration:none;mso-line-height-rule:exactly;">${c.button}</a></td></tr></table>`,
    c.expiry ? `${P_INK}${html(c.expiry)}</p>` : "",
    `<table ${TABLE} width="100%"><tr><td class="rule" style="border-top:1px solid #d9d9d6;font-size:0;line-height:0;height:20px;">&nbsp;</td></tr></table>`,
    `${P_DIM}If the button doesn't work, copy this link into your browser:<br><a class="link" href="${url}" style="${LINK_STYLE}">${url}</a></p>`,
    `${P_DIM}${html(c.ignore)}</p>`,
  ].join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${html(c.subject)}</title>
<style>
@media (prefers-color-scheme:dark){.bg{background:#161617!important}.card{background:#1f1f20!important;border-color:#3a3a3d!important}.ink{color:#f2f2f3!important}.dim{color:#b9b9bf!important}.rule{border-color:#3a3a3d!important}.btn{background:#f2f2f3!important}.btn a{color:#161617!important}.link{color:#f2f2f3!important}.quote{border-color:#6e6e76!important}}
@media (max-width:620px){.wrap{width:100%!important}.pad{padding-left:20px!important;padding-right:20px!important}}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f3f3f1;">
<span style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${html(c.preheader)}</span>
<table ${TABLE} width="100%" class="bg" bgcolor="#f3f3f1" style="background:#f3f3f1;">
<tr><td align="center" style="padding:32px 12px;">
<table ${TABLE} width="600" class="wrap" style="width:600px;max-width:600px;">
<tr><td class="pad ink" style="padding:0 32px 16px;font:bold 20px/28px ${FONT};color:#111111;">Todoi</td></tr>
<tr><td class="card" bgcolor="#fbfbfa" style="background:#fbfbfa;border:1px solid #d9d9d6;">
<table ${TABLE} width="100%"><tr><td class="pad" style="padding:32px 32px 20px;">
<h1 class="ink" style="margin:0 0 16px;font:bold 22px/30px ${FONT};color:#111111;mso-line-height-rule:exactly;">${html(c.heading)}</h1>
${body}
</td></tr></table>
</td></tr>
<tr><td class="pad dim" style="padding:16px 32px 0;font:13px/20px ${FONT};color:#55555a;mso-line-height-rule:exactly;">${html(c.footer)}<br>Todoi &middot; <a class="link" href="${SITE}" style="${LINK_STYLE}">todoi.com</a> &middot; <a class="link" href="${HELP}" style="${LINK_STYLE}">Help</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

/** Word-wrap one paragraph for the plain-text part; a word longer than the line (a URL) keeps its own line. */
export function wrapText(text: string, width = TEXT_WIDTH, indent = ""): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      lines.push(indent + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(indent + line);
  return lines.join("\n");
}

function renderText(c: EmailContent): string {
  const blocks = [
    wrapText(plain(c.heading)),
    wrapText(plain(c.intro)),
    ...(c.quote ? [`${wrapText(`"${oneLine(c.quote.message)}"`, TEXT_WIDTH, "    ")}\n${wrapText(oneLine(c.quote.by), TEXT_WIDTH, "    ")}`] : []),
    `${c.linkLead}\n${c.url}`,
    ...(c.expiry ? [wrapText(plain(c.expiry))] : []),
    wrapText(plain(c.ignore)),
    `--\n${wrapText(plain(c.footer))}\nTodoi - ${SITE} - Help: ${HELP}`,
  ];
  return `${blocks.join("\n\n")}\n`;
}

function render(c: EmailContent): RenderedEmail {
  return { subject: plain(c.subject), html: renderHtml(c), text: renderText(c) };
}

const RESET_SPAN = linkSpan(RESET_LINK_MINUTES);
const EMAIL_SPAN = linkSpan(EMAIL_LINK_HOURS * 60);

/** To the account address: the link opens the reset page. */
export function passwordResetEmail({ email, url }: { email: string; url: string }): RenderedEmail {
  return render({
    subject: ["Reset your Todoi password"],
    preheader: [`Use this link to set a new password. It works once and expires in ${RESET_SPAN}.`],
    heading: ["Reset your password"],
    intro: ["We got a request to reset the password for ", b(email), "."],
    button: "Set a new password",
    linkLead: "Set a new password:",
    url,
    expiry: [`The link works once and expires in ${RESET_SPAN}.`],
    ignore: ["Didn't ask for this? Ignore this email. Your password stays the same."],
    footer: ["You got this email because someone asked to reset the password for this address."],
  });
}

/** To the address that signed up. */
export function verifyEmailEmail({ email, url }: { email: string; url: string }): RenderedEmail {
  return render({
    subject: ["Confirm your email for Todoi"],
    preheader: ["Confirm your address to finish setting up your Todoi account."],
    heading: ["Confirm your email"],
    intro: ["Confirm that ", b(email), " is yours to finish setting up your Todoi account."],
    button: "Confirm email",
    linkLead: "Confirm your email:",
    url,
    expiry: [`The link expires in ${EMAIL_SPAN}.`],
    ignore: ["Didn't create a Todoi account? Ignore this email and no account is set up."],
    footer: ["You got this email because this address was used to sign up for Todoi."],
  });
}

/** To the NEW address; the old one keeps logging in until the link is opened. */
export function changeEmailEmail({ oldEmail, newEmail, url }: { oldEmail: string; newEmail: string; url: string }): RenderedEmail {
  return render({
    subject: ["Confirm your new email for Todoi"],
    preheader: ["Confirm that you want to log in to Todoi with this address."],
    heading: ["Confirm your new email"],
    intro: ["Confirm that you want to log in to Todoi with ", b(newEmail), " instead of ", b(oldEmail), "."],
    button: "Confirm new email",
    linkLead: "Confirm your new email:",
    url,
    expiry: ["Until you confirm, you log in with ", v(oldEmail), `. The link expires in ${EMAIL_SPAN}.`],
    ignore: ["Didn't ask for this? Ignore this email and nothing changes."],
    footer: ["You got this email because someone asked to use this address for a Todoi account."],
  });
}

/** Role names and what each lets the invited person do (one line, after "as an Editor:"). */
export const ROLE_MEANINGS: Record<MemberRole, { name: string; article: "a" | "an"; meaning: string }> = {
  owner: { name: "Owner", article: "an", meaning: "you decide who works in it and what happens to it" },
  admin: { name: "Admin", article: "an", meaning: "you can add and change items, and manage members and settings" },
  editor: { name: "Editor", article: "an", meaning: "you can add and change items" },
  viewer: { name: "Viewer", article: "a", meaning: "you can open everything but change nothing" },
};

/** "Dec 8, 2026": the day the invite stops working (UTC: the recipient's zone is unknown). */
export const inviteDate = (at: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(at);

export interface InviteEmailInput {
  /** The invited address */
  email: string;
  inviterName: string;
  inviterEmail: string;
  projectName: string;
  role: MemberRole;
  /** The inviter's note; the quote row is left out without one */
  message?: string | null;
  url: string;
  expiresAt: Date;
}

export function projectInviteEmail({ email, inviterName, inviterEmail, projectName, role, message, url, expiresAt }: InviteEmailInput): RenderedEmail {
  const r = ROLE_MEANINGS[role];
  return render({
    subject: [v(inviterName), " invited you to “", v(projectName), "” on Todoi"],
    preheader: ["Join the project ", v(projectName), ` as ${r.article} ${r.name}.`],
    heading: [v(inviterName), " invited you to ", v(projectName)],
    intro: ["You'll join the project ", b(projectName), ` as ${r.article} `, b(r.name), `: ${r.meaning}.`],
    quote: message?.trim() ? { message, by: inviterName } : undefined,
    button: "Open invitation",
    linkLead: "Open the invitation:",
    url,
    expiry: ["The invitation is for ", v(email), ` and expires on ${inviteDate(expiresAt)}.`],
    ignore: ["Don't know ", v(inviterName), "? Ignore this email. You won't be added to anything."],
    footer: ["You got this email because ", v(inviterName), " (", v(inviterEmail), ") invited this address to a Todoi project."],
  });
}

export type NotificationKind = "assignment" | "mention" | "watch";

/** Each kind's switch under Settings › Notifications › Email notifications, as the recipient sees it named. */
const SWITCHES: Record<NotificationKind, string> = { assignment: "Assignments", mention: "Mentions", watch: "Comments" };

export interface NotificationEmailInput {
  kind: NotificationKind;
  actorName: string;
  /** The item's key ("NT-7"), when its project group issues them */
  itemKey?: string | null;
  itemTitle: string;
  projectName: string;
  /** The comment, for a mention or a comment on a watched item */
  excerpt?: string | null;
  /** The item, opened over its project */
  url: string;
}

const EXCERPT_CHARS = 400;
const excerptOf = (text: string) => {
  const line = oneLine(text);
  return line.length > EXCERPT_CHARS ? `${line.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : line;
};

/** The email copy of an Inbox notification (services/notifications.ts): the same subject as the Inbox item's title. */
export function notificationEmail({ kind, actorName, itemKey, itemTitle, projectName, excerpt, url }: NotificationEmailInput): RenderedEmail {
  const item = itemKey ? `${itemKey}: ${itemTitle}` : itemTitle;
  const quote = kind !== "assignment" && excerpt?.trim() ? { message: excerptOf(excerpt), by: actorName } : undefined;
  const what: Record<NotificationKind, { subject: Piece[]; heading: Piece[]; intro: Piece[]; reason: string }> = {
    assignment: { subject: [v(actorName), " assigned ", v(itemKey ?? "an item"), " to you: ", v(itemTitle)], heading: [v(actorName), " assigned you an item"], intro: [b(actorName), " assigned ", b(item), " to you in ", b(projectName), "."], reason: "an item in a Todoi project was assigned to you" },
    mention: { subject: [v(actorName), " mentioned you on ", v(item)], heading: [v(actorName), " mentioned you"], intro: [b(actorName), " mentioned you in a comment on ", b(item), " in ", b(projectName), quote ? ":" : "."], reason: "you were @mentioned in a Todoi project" },
    watch: { subject: [v(actorName), " commented on ", v(item)], heading: [v(actorName), " commented on an item you watch"], intro: [b(actorName), " commented on ", b(item), " in ", b(projectName), quote ? ":" : "."], reason: "you watch an item in a Todoi project" },
  };
  const w = what[kind];
  return render({
    subject: w.subject,
    preheader: quote ? [v(quote.message)] : ["Open ", v(item), " in ", v(projectName), "."],
    heading: w.heading,
    intro: w.intro,
    quote,
    button: "Open item",
    linkLead: "Open the item:",
    url,
    ignore: [`Don't want these emails? Turn off ${SWITCHES[kind]} under Settings › Notifications › Email notifications. The item is in your Todoi Inbox too.`],
    footer: [`You got this email because ${w.reason} and your ${SWITCHES[kind]} emails are on.`],
  });
}
