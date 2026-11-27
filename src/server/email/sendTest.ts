// Sends one test email through the app's own mailer (transport.ts), to check the Resend key and the
// sender before anything depends on them:
//   npm run email:test -- info@todoi.com
//   npm run email:test -- info@todoi.com --from "onboarding@resend.dev"   (before todoi.com is verified at Resend)
// Reads RESEND_API_KEY and EMAIL_FROM from the environment (.env); without a key it only writes the file.
import { createMailer, EmailNotSent } from "./transport";

const args = process.argv.slice(2);
const flag = args.indexOf("--from");
const from = flag >= 0 ? args.splice(flag, 2)[1] : undefined;
const to = args[0];
if (!to?.includes("@")) {
  console.error('Usage: npm run email:test -- <to-address> [--from "name <address>"]');
  process.exit(1);
}

const key = process.env.RESEND_API_KEY || undefined;
const config = { RESEND_API_KEY: key, EMAIL_FROM: from ?? (process.env.EMAIL_FROM || "todoi <no-reply@todoi.com>"), EMAIL_DIR: process.env.EMAIL_DIR || ".data/emails" };
const sent = new Date().toISOString();

try {
  await createMailer(config)({
    to,
    subject: "todoi test email",
    html: "<p>Congrats on sending your <strong>first todoi email</strong>!</p>",
    text: `Congrats on sending your first todoi email!\n\nSent ${sent}.\n`,
  });
  console.info(key ? `Sent to ${to} from ${config.EMAIL_FROM}.` : "No RESEND_API_KEY: nothing was sent.");
} catch (error) {
  console.error(error instanceof EmailNotSent ? `Not sent: ${error.message} (the reason is logged above)` : error);
  process.exit(1);
}
