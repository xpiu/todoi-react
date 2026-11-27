// The app's one mailer, configured from the environment (RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, EMAIL_DIR).
import { env } from "../env";
import { createMailer } from "./transport";

export { EmailNotSent, writtenEmails, type EmailAttachment, type WrittenEmail } from "./transport";
export * from "./templates";
export * from "./qaReport";

if (!env.DEV && !env.RESEND_API_KEY) console.warn(`RESEND_API_KEY is not set: emails are written to ${env.EMAIL_DIR} and not sent.`);

export const sendEmail = createMailer(env);
