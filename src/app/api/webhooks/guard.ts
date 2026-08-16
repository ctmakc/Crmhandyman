import { NextResponse } from "next/server";
import crypto from "crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * The doorway of every integration hook (ROADMAP debt: "no rate-limit on webhooks").
 *
 * These three routes are the only endpoints on the box that an unauthenticated stranger
 * may call as often as they like. Each delivery reads a body, runs an HMAC over it and
 * then queries the database — so the refusal has to come BEFORE all three. `throttle()`
 * is the first statement of every handler: it costs one map lookup, reads no body,
 * hashes nothing and touches no table.
 *
 * The address comes from `clientIp`, which counts the forwarded-for chain from the right
 * through TRUSTED_PROXY_HOPS. Rotating that header walked straight through the login
 * throttle once already; the same rule is the reason it cannot mint identities here.
 */

/** Meta delivers in batches and Mailgun retries; a live hook stays far under this. */
const BURST_LIMIT = 60;
const BURST_WINDOW_MS = 60_000;

/**
 * The sustained ceiling. A busy shop takes tens of leads a day — six hundred deliveries
 * an hour from one address is either a loop at the sender or someone paying us to hash.
 */
const HOURLY_LIMIT = 600;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;

/**
 * The subscribe handshake is the one door where a secret can be GUESSED: it answers
 * with the challenge when the verify token matches. Meta calls it when a page is
 * subscribed — a handful of times ever — so a guesser gets ten tries an hour and the
 * token stays out of reach.
 */
const VERIFY_LIMIT = 10;
const VERIFY_WINDOW_MS = 60 * 60 * 1000;

/** A bare 429: the caller learns the rate and nothing about the workspace behind it. */
function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/** Non-null means "answer this and stop" — call it before reading the body. */
export async function throttle(req: Request, hook: string): Promise<NextResponse | null> {
  const ip = clientIp(req);

  const burst = await rateLimit(`webhook:${hook}:min:${ip}`, BURST_LIMIT, BURST_WINDOW_MS);
  if (!burst.ok) return tooMany(burst.retryAfter);

  const sustained = await rateLimit(`webhook:${hook}:hr:${ip}`, HOURLY_LIMIT, HOURLY_WINDOW_MS);
  if (!sustained.ok) return tooMany(sustained.retryAfter);

  return null;
}

/** The same door for the verify handshake, on a far tighter budget. */
export async function throttleVerify(req: Request, hook: string): Promise<NextResponse | null> {
  const limited = await rateLimit(`webhook:${hook}:verify:${clientIp(req)}`, VERIFY_LIMIT, VERIFY_WINDOW_MS);
  return limited.ok ? null : tooMany(limited.retryAfter);
}

/**
 * Constant-time token comparison, fail-closed on an unset secret.
 *
 * An empty `META_WEBHOOK_VERIFY_TOKEN` compared equal to an empty `hub.verify_token`,
 * so a deployment that left the variable blank handed the challenge to anyone who asked.
 */
export function tokenMatches(given: string | null, expected: string | undefined): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
