import { Hono, type MiddlewareHandler } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({ env: { RATE_LIMIT: true, TRUST_PROXY_HOPS: 0, TRUST_CLOUDFLARE: false }, DEV: false }));
const { addressKey, clientIp, createCounter, invalidTokenLimit, INVALID_TOKENS, rateLimit } = await import("./rateLimit");
const { onError } = await import("./errors");

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe("createCounter", () => {
  it("allows `limit` hits per window and starts again when the window ends", () => {
    const c = clock();
    const counter = createCounter({ limit: 3, windowMs: 1000, now: c.now });
    expect([1, 2, 3].map(() => counter.hit("a").allowed)).toEqual([true, true, true]);
    expect(counter.hit("a")).toMatchObject({ allowed: false, remaining: 0, resetAt: 1_001_000 });
    expect(counter.hit("b").allowed).toBe(true);
    c.advance(1000);
    expect(counter.hit("a")).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("checks without counting, and forgets a key on reset", () => {
    const counter = createCounter({ limit: 2, windowMs: 1000 });
    expect(counter.blocked("a")).toBeNull();
    counter.hit("a");
    expect(counter.blocked("a")).toBeNull();
    counter.hit("a");
    expect(counter.blocked("a")).toMatchObject({ allowed: false });
    counter.reset("a");
    expect(counter.blocked("a")).toBeNull();
  });

  it("drops the oldest key past maxKeys instead of growing", () => {
    const counter = createCounter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    counter.hit("a");
    counter.hit("b");
    counter.hit("c");
    // "a" was dropped, so it starts a fresh window; "b" is still full.
    expect(counter.hit("a").allowed).toBe(true);
    expect(counter.blocked("c")).not.toBeNull();
  });
});

describe("addresses", () => {
  it("count an IPv4-mapped address as IPv4 and IPv6 per /64", () => {
    expect(addressKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(addressKey("203.0.113.9")).toBe("203.0.113.9");
    expect(addressKey("2001:db8:0:1:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:0:1::/64");
    expect(addressKey("2001:db8:0:1::5")).toBe("2001:db8:0:1::/64");
    expect(addressKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressKey("fe80::1%en0")).toBe("fe80:0:0:0::/64");
    expect(addressKey("::1")).toBe("0:0:0:0::/64");
  });

  it("trust only the entries the configured proxies appended", async () => {
    const seen: string[] = [];
    const app = (hops: number) => new Hono().get("/", (c) => { seen.push(clientIp(c, hops)); return c.text("ok"); });
    const xff = { "x-forwarded-for": "6.6.6.6, 198.51.100.7, 10.0.0.2" };
    await app(0).request("/", { headers: xff });
    await app(1).request("/", { headers: xff });
    await app(2).request("/", { headers: xff });
    await app(5).request("/", { headers: xff });
    // No socket under app.request(): "unknown". One proxy: its entry; two: the one before. Never the client's own claim.
    expect(seen).toEqual(["unknown", "10.0.0.2", "198.51.100.7", "unknown"]);
  });

  it("take Cloudflare's CF-Connecting-IP only from Cloudflare's edge", async () => {
    const seen: string[] = [];
    const app = new Hono().get("/", (c) => { seen.push(clientIp(c, 1, true)); return c.text("ok"); });
    // Traefik reports the sender: a Cloudflare edge address, then an address outside Cloudflare (a direct hit).
    await app.request("/", { headers: { "x-forwarded-for": "162.158.1.2", "cf-connecting-ip": "203.0.113.9" } });
    await app.request("/", { headers: { "x-forwarded-for": "2a06:98c0::1", "cf-connecting-ip": "2001:db8:5::7" } });
    await app.request("/", { headers: { "x-forwarded-for": "198.51.100.7", "cf-connecting-ip": "203.0.113.9" } });
    await app.request("/", { headers: { "x-forwarded-for": "162.158.1.2", "cf-connecting-ip": "not an address" } });
    expect(seen).toEqual(["203.0.113.9", "2001:db8:5:0::/64", "198.51.100.7", "162.158.1.2"]);
  });
});

describe("rateLimit middleware", () => {
  const appWith = (limit: MiddlewareHandler) => new Hono().use("*", limit).get("/", (c) => c.text("ok")).onError(onError);
  const rule = { name: "test", limit: 2, windowMs: 60_000, key: () => "k", message: "Slow down." };

  it("answers 429 in the shared error shape with Retry-After and RateLimit fields", async () => {
    const app = appWith(rateLimit(rule, { enabled: true }));
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(200);
    const refused = await app.request("/");
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error: "Slow down.", code: "rate_limited" });
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(refused.headers.get("ratelimit-limit")).toBe("2");
    expect(refused.headers.get("ratelimit-remaining")).toBe("0");
  });

  it("lets everything through when turned off or when the rule has no key for the request", async () => {
    const off = appWith(rateLimit(rule, { enabled: false }));
    const keyless = appWith(rateLimit({ ...rule, key: () => null }, { enabled: true }));
    for (let i = 0; i < 5; i++) {
      expect((await off.request("/")).status).toBe(200);
      expect((await keyless.request("/")).status).toBe(200);
    }
  });
});

describe("invalidTokenLimit", () => {
  // Stands in for authMiddleware: "good" resolves to a token, anything else doesn't.
  const fakeAuth: MiddlewareHandler = async (c, next) => {
    if (c.req.header("authorization") === "Bearer good") c.set("tokenId", "t1");
    await next();
  };
  const app = () => new Hono().use("*", invalidTokenLimit({ enabled: true })).use("*", fakeAuth).get("/", (c) => c.text("ok")).onError(onError);

  it("refuses tokens from an address after too many that didn't work, without counting good ones or no token", async () => {
    const a = app();
    for (let i = 0; i < 50; i++) expect((await a.request("/", { headers: { authorization: "Bearer good" } })).status).toBe(200);
    for (let i = 0; i < INVALID_TOKENS.limit; i++) expect((await a.request("/", { headers: { authorization: `Bearer guess-${i}` } })).status).toBe(200);
    const refused = await a.request("/", { headers: { authorization: "Bearer good" } });
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { error: string }).error).toMatch(/API token that doesn't work/);
    // Requests without a token (a browser session) aren't affected.
    expect((await a.request("/")).status).toBe(200);
  });
});
