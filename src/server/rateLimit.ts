// Request throttling (work plan R3): fixed-window counters kept in this process's memory, keyed by the
// client's address, an API token or an account. One instance serves Todoi today (the Dockerfile), so
// in-memory counts are exact; a second instance would multiply each limit by the instance count. Limits
// that must hold across restarts and instances (wrong passwords per account) count in Postgres instead
// (services/attempts.ts). On by default in production; RATE_LIMIT=false turns them off, and development
// leaves them off so local runs and the e2e suite aren't throttled.
import { createHash } from "node:crypto";
import { BlockList, isIP } from "node:net";
import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

import { env } from "./env";
import { fail, logRequest } from "./errors";

export interface Hit {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** When this window ends, in ms since the epoch */
  resetAt: number;
}

export interface Counter {
  /** Counts one request for the key */
  hit(key: string): Hit;
  /** Whether the key is already over its limit, without counting */
  blocked(key: string): Hit | null;
  reset(key: string): void;
}

/**
 * At most `limit` hits per key in each `windowMs` window (a window starts at a key's first hit). Expired keys
 * are swept once a window; past `maxKeys` the oldest key is dropped, so a flood of addresses can't exhaust memory.
 */
export function createCounter({ limit, windowMs, maxKeys = 100_000, now = Date.now }: { limit: number; windowMs: number; maxKeys?: number; now?: () => number }): Counter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let sweepAt = 0;
  const live = (key: string, t: number) => {
    if (t >= sweepAt) {
      for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
      sweepAt = t + windowMs;
    }
    const w = windows.get(key);
    return w && w.resetAt > t ? w : undefined;
  };
  const report = (count: number, resetAt: number): Hit => ({ allowed: count <= limit, limit, remaining: Math.max(0, limit - count), resetAt });
  return {
    hit(key) {
      const t = now();
      let w = live(key, t);
      if (!w) {
        windows.delete(key);
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value!);
        w = { count: 0, resetAt: t + windowMs };
        windows.set(key, w);
      }
      w.count++;
      return report(w.count, w.resetAt);
    },
    blocked(key) {
      const w = live(key, now());
      return w && w.count >= limit ? report(w.count + 1, w.resetAt) : null;
    },
    reset(key) {
      windows.delete(key);
    },
  };
}

/** Cloudflare's edge (cloudflare.com/ips, checked 2026-11-26): the only senders whose CF-Connecting-IP counts */
const CLOUDFLARE = new BlockList();
for (const range of ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"]) CLOUDFLARE.addSubnet(...subnet(range, "ipv4"));
for (const range of ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"]) CLOUDFLARE.addSubnet(...subnet(range, "ipv6"));
function subnet(range: string, type: "ipv4" | "ipv6"): [string, number, "ipv4" | "ipv6"] {
  const [network = "", prefix = ""] = range.split("/");
  return [network, Number(prefix), type];
}
const fromCloudflare = (ip: string) => {
  const plain = ip.replace(/^::ffff:(?=\d+\.)/i, "");
  const type = isIP(plain);
  return type !== 0 && CLOUDFLARE.check(plain, type === 4 ? "ipv4" : "ipv6");
};

/**
 * The caller's address. Behind TRUST_PROXY_HOPS reverse proxies (each appends to X-Forwarded-For) it is the
 * entry that many places from the end — earlier entries are whatever the client sent. Otherwise the socket's.
 * With TRUST_CLOUDFLARE, a request that address shows came from Cloudflare's edge is the visitor's own
 * CF-Connecting-IP instead; anyone reaching the origin directly can't claim one. IPv6 addresses count per
 * /64, the block one subscriber usually gets.
 */
export function clientIp(c: Context, hops = env.TRUST_PROXY_HOPS, cloudflare = env.TRUST_CLOUDFLARE): string {
  let ip: string | undefined;
  if (hops > 0) {
    const chain = (c.req.header("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    ip = chain[chain.length - hops];
  }
  if (!ip) {
    try {
      ip = getConnInfo(c).remote.address;
    } catch {
      // app.request() in tests has no socket.
    }
  }
  if (cloudflare && ip && fromCloudflare(ip)) {
    const visitor = c.req.header("cf-connecting-ip")?.trim();
    if (visitor && isIP(visitor)) ip = visitor;
  }
  return ip ? addressKey(ip) : "unknown";
}

/** "::ffff:1.2.3.4" → "1.2.3.4"; an IPv6 address → its /64 ("2001:db8:0:1::/64"). */
export function addressKey(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1]!;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("%")[0]!.split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** The refusal every limit sends: 429 in the shared error shape, with Retry-After and the RateLimit fields. */
export function tooMany(c: Context, hit: Hit, name: string, message = "Too many requests. Wait a moment and try again.") {
  const seconds = Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000));
  c.header("Retry-After", String(seconds));
  c.header("RateLimit-Limit", String(hit.limit));
  c.header("RateLimit-Remaining", "0");
  c.header("RateLimit-Reset", String(seconds));
  logRequest("warn", c, 429, { event: "rate-limited", limit: name });
  return fail(c, 429, message);
}

export interface LimitRule {
  /** Shows in the log line of a refusal */
  name: string;
  limit: number;
  windowMs: number;
  /** What one budget belongs to (an address, a token); null = this request isn't limited by this rule */
  key: (c: Context) => string | null;
  message?: string;
}

/** A rule as Hono middleware. `enabled` defaults to RATE_LIMIT (tests pass it). */
export function rateLimit(rule: LimitRule, { enabled = env.RATE_LIMIT, now }: { enabled?: boolean; now?: () => number } = {}): MiddlewareHandler {
  const counter = createCounter({ limit: rule.limit, windowMs: rule.windowMs, now });
  return async (c, next) => {
    const key = enabled ? rule.key(c) : null;
    if (key === null) return next();
    const hit = counter.hit(key);
    if (!hit.allowed) return tooMany(c, hit, rule.name, rule.message);
    return next();
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** The API token a request presents (before it is checked), as the header carries it. */
const bearerOf = (c: Context) => /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? null;
const viewerId = (c: Context) => (c.get("viewer") as { userId?: string } | null | undefined)?.userId ?? null;

/**
 * Every limit in one table, so they can be read and tuned together. The numbers follow the Next.js app's
 * (auth 100/min, API 1000/min, token 600/10 min, an invalid-token limit, capped exports), tightened for
 * the endpoints that send email or create accounts.
 */
export const LIMITS = {
  /** Everything under /api from one address (health checks excepted) */
  address: { name: "address", limit: 1200, windowMs: MINUTE, key: (c) => clientIp(c) },
  /** Password and passkey log-ins from one address; each account also has its own count (services/attempts.ts) */
  signIn: { name: "sign-in", limit: 30, windowMs: 10 * MINUTE, key: (c) => clientIp(c), message: "Too many log-in attempts from your network. Try again in a few minutes." },
  /** New accounts from one address */
  signUp: { name: "sign-up", limit: 10, windowMs: HOUR, key: (c) => clientIp(c), message: "Too many new accounts from your network. Try again later." },
  /** Guest workspaces (each first visit makes one) from one address */
  guest: { name: "guest", limit: 30, windowMs: HOUR, key: (c) => clientIp(c), message: "Too many guest workspaces from your network. Create an account or try again later." },
  /** Reset and confirmation emails asked for from one address; each address also has its own cap (auth.ts) */
  authEmail: { name: "auth-email", limit: 10, windowMs: HOUR, key: (c) => clientIp(c), message: "Too many emails asked for from your network. Try again later." },
  /** One API token's requests (`Authorization: Bearer tdi_…`), checked or not */
  token: { name: "token", limit: 600, windowMs: 10 * MINUTE, key: (c) => { const t = bearerOf(c); return t && createHash("sha256").update(t).digest("base64url"); }, message: "This API token made too many requests. Wait a few minutes and try again." },
  /** Account exports (JSON and calendar), per person */
  export: { name: "export", limit: 10, windowMs: HOUR, key: viewerId, message: "You've exported a lot in the last hour. Try again later." },
  /** Error reports from the browser (POST /api/errors), per person; a page sends at most 20 (client/errorReporting.ts) */
  clientErrors: { name: "client-errors", limit: 60, windowMs: 10 * MINUTE, key: viewerId },
  /** Inbound repository webhooks, per sender address and endpoint (mount on the webhook route) */
  webhook: { name: "webhook", limit: 120, windowMs: MINUTE, key: (c) => `${clientIp(c)} ${c.req.path}` },
} satisfies Record<string, LimitRule>;

/** Tokens that don't work, from one address: past this, a request with any token is refused before it is looked up. */
export const INVALID_TOKENS = { limit: 20, windowMs: 10 * MINUTE };

/**
 * Wraps the session middleware: a request whose `Bearer` token didn't resolve (unknown, revoked, expired)
 * counts against its address; once over INVALID_TOKENS, tokens from there are refused without a lookup.
 */
export function invalidTokenLimit({ enabled = env.RATE_LIMIT, now }: { enabled?: boolean; now?: () => number } = {}): MiddlewareHandler {
  const counter = createCounter({ ...INVALID_TOKENS, now });
  return async (c, next) => {
    if (!enabled || !bearerOf(c)) return next();
    const ip = clientIp(c);
    const over = counter.blocked(ip);
    if (over) return tooMany(c, over, "invalid-token", "Too many requests with an API token that doesn't work. Check the token and try again later.");
    await next();
    if (!c.get("tokenId")) counter.hit(ip);
  };
}
