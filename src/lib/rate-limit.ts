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

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
