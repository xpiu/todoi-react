// Secrets Git sync keeps (GitHub tokens, webhook secrets): AES-256-GCM, a fresh 12-byte nonce each time,
// stored as "v1.<nonce>.<tag>.<ciphertext>" in base64url. The key is SYNC_SECRET_KEY, or one derived from
// BETTER_AUTH_SECRET with HKDF when that is unset.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { env } from "../env";

let cached: Buffer | null = null;
const key = () => (cached ??= Buffer.from(hkdfSync("sha256", env.SYNC_SECRET_KEY ?? env.BETTER_AUTH_SECRET, "todoi", "git sync secrets v1", 32)));

export function seal(plain: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", nonce, cipher.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** The plain secret, or null when it can't be opened (tampered, or sealed under another key). */
export function open(sealed: string): string | null {
  const [v, nonce, tag, body] = sealed.split(".");
  if (v !== "v1" || !nonce || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "github_pat_11AB…x7Qa": recognisable in a list, useless to anyone who sees it. */
export const tokenHint = (token: string) => (token.length > 12 ? `${token.slice(0, token.startsWith("github_pat_") ? 15 : 4)}…${token.slice(-4)}` : "…");
