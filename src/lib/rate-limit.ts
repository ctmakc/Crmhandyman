/**
 * Fixed-window counter held in process memory. The product runs as a single container
 * against one SQLite file, so there is nowhere else for this to live yet; move it to a
 * shared store on the day a second instance appears.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 10_000) sweep(now);
    return { ok: true };
  }

  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { ok: true };
}

/** Best-effort trim so a long-running process cannot grow this map without bound. */
function sweep(now: number) {
  hits.forEach((entry, key) => {
    if (entry.resetAt <= now) hits.delete(key);
  });
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
