import { createHash } from "node:crypto";
import { prisma } from "./prisma";

/**
 * Fixed-window counter in the product's own SQLite file. It lived in process memory
 * first, but this app restarts on every deploy and every `systemctl restart` — and each
 * restart handed a fresh set of login attempts to whoever was counting. One database,
 * one instance: the bucket table costs one indexed upsert per guarded request.
 *
 * Keys are salted hashes, so the table never stores a raw address or account name.
 */
export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

function bucketKey(key: string): string {
  const salt = process.env.NEXTAUTH_SECRET || "";
  return createHash("sha256").update(`${key}\0${salt}`).digest("hex");
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const freshReset = now + windowMs;

  /**
   * One statement so two racing requests cannot both read "empty" and write "1":
   * an expired bucket restarts at 1, a live one increments, and the row comes back.
   */
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint; resetAt: number | bigint }>>(
    `INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
     VALUES (?, 1, ?)
     ON CONFLICT("key") DO UPDATE SET
       "count" = CASE WHEN "resetAt" <= ? THEN 1 ELSE "count" + 1 END,
       "resetAt" = CASE WHEN "resetAt" <= ? THEN ? ELSE "resetAt" END
     RETURNING "count", "resetAt"`,
    bucketKey(key),
    freshReset,
    now,
    now,
    freshReset
  );

  const count = Number(rows[0]?.count ?? limit + 1);
  const resetAt = Number(rows[0]?.resetAt ?? freshReset);

  /** A fresh window is a cheap moment to drop everyone's dead buckets. */
  if (count === 1) {
    prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lte: now } } }).catch(() => {});
  }

  if (count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  }
  return { ok: true };
}

/**
 * How many proxies sit in front of this app. One by default — the Caddy in DEPLOY.md.
 * A wrong value here is a real hole, so it stays a deliberate number in the environment.
 *
 * ZERO IS A REAL SETTING and means «nothing stands in front of me»: the header is
 * ignored entirely and only the socket address counts. The floor used to be one, so an
 * instance published straight to the internet had no way to stop trusting a header
 * anybody could type — twelve wrong passwords with a rotating `X-Forwarded-For` and the
 * thirteenth, correct one walked in. Anything unparseable still lands on one, which is
 * the deployment this repo documents.
 */
const TRUSTED_PROXY_HOPS = (() => {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : 1;
})();

/**
 * The caller's address, as far as it can be trusted.
 *
 * `X-Forwarded-For` is a list the client is free to start: a request arriving with
 * `X-Forwarded-For: 10.9.8.7` reaches the app as `10.9.8.7, <real address>`, so reading
 * the FIRST entry hands every attacker an unlimited supply of fresh identities. Rotating
 * that header walked straight through the login throttle — the one wall between a
 * stranger and the whole customer base — and burned other people's intake quota.
 *
 * Count from the right instead: the last entry was appended by our own proxy and the
 * client cannot forge it. Each additional trusted hop moves one position left.
 */
export function clientIp(req: Request): string {
  return clientIpFromHeaders(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
}

/**
 * The same rule for callers that never see a `Request`. NextAuth hands `authorize()` a
 * plain headers object, and the login throttle — the one that matters most — kept its
 * own copy of this parsing, reading the leftmost entry long after the shared helper had
 * stopped. Two implementations of one rule means one of them is wrong.
 */
export function clientIpFromHeaders(
  forwardedFor: string | null | undefined,
  realIp?: string | null
): string {
  /**
   * No proxy in front: `X-Forwarded-For` is the caller's own writing and is worth
   * nothing, so it is not read at all. Everything then shares the `unknown` bucket
   * unless something local sets `x-real-ip` — which makes the throttle strict rather
   * than absent, and is the safe way round. DEPLOY.md puts Caddy in front for exactly
   * this reason; zero is for an operator who knows he has not.
   */
  if (TRUSTED_PROXY_HOPS === 0) return realIp || "unknown";

  const chain = (forwardedFor ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (chain.length) return chain[Math.max(chain.length - TRUSTED_PROXY_HOPS, 0)];
  return realIp || "unknown";
}
