// The app's one mailer, configured from the environment (RESEND_API_KEY, EMAIL_FROM, EMAIL_DIR).
import { env } from "../env";
import { createMailer } from "./transport";

export { EmailNotSent } from "./transport";
export * from "./templates";

if (!env.DEV && !env.RESEND_API_KEY) console.warn(`RESEND_API_KEY is not set: emails are written to ${env.EMAIL_DIR} and not sent.`);

export const sendEmail = createMailer(env);
