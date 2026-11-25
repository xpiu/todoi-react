// What an API token may do (work plan R5): read only, or read and write; across every project the person
// is in plus their Inbox, or only in the projects picked when it was made. A token never does more than
// its owner could, and its reach is fixed at creation — make a new token to change it.
import { z } from "zod";

import { idSchema } from "./items";

export const TOKEN_ACCESS = ["read", "write"] as const;
export type TokenAccess = (typeof TOKEN_ACCESS)[number];
export const TOKEN_ACCESS_NAMES: Record<TokenAccess, string> = { read: "Read only", write: "Read and write" };

/** The most projects one token can be limited to; past that, "every project" is the honest choice. */
export const MAX_TOKEN_PROJECTS = 50;

export const createTokenSchema = z.object({
  name: z.string().trim().min(1, "Name the token").max(80),
  days: z.number().int().min(1).max(365).default(90),
  /** Least privilege unless asked for: a token that doesn't say can only read. */
  access: z.enum(TOKEN_ACCESS).default("read"),
  /** null = every project the person is in, now and later, and their Inbox */
  projectIds: z.array(idSchema).min(1, "Pick at least one project").max(MAX_TOKEN_PROJECTS, `A token can be limited to at most ${MAX_TOKEN_PROJECTS} projects`).nullable().default(null),
});
export type CreateTokenInput = z.input<typeof createTokenSchema>;

/** "Read only · All projects and the Inbox", "Read and write · Website, Sales" — a token's reach in a hint. */
export function describeTokenReach(token: { access: TokenAccess; projectIds: string[] | null }, projectName: (id: string) => string | undefined): string {
  const where = token.projectIds ? token.projectIds.map((id) => projectName(id) ?? "a project you left").join(", ") : "All projects and the Inbox";
  return `${TOKEN_ACCESS_NAMES[token.access]} · ${where}`;
}
