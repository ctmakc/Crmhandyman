import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { slugFromHost } from "@/lib/tenant-slug";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/expired",
  // The Google sign-up waiting room: a workspace that exists but is not approved yet, or
  // an account that has not named one. Reachable with a half-formed session.
  "/pending",
  // A member who joined through an open link waits here for the owner to let them in. Like
  // /pending it is reachable with a session that carries no desk, so it must be public or
  // the redirect below would loop.
  "/awaiting",
  // The public join page and its validate/accept API. Whoever holds the token opens these
  // with no session at all — that is the whole point of a shareable link.
  "/join",
  "/api/join",
  "/api/auth",
  "/api/webhooks",
  "/api/intake",
  "/api/health",
  "/api/tenant/resolve",
  "/api/register",
  "/_next",
  "/favicon.ico",
  /**
   * The installable shell. These four carry no workspace data — a script, a manifest, a
   * static «no connection» card and four icons — and every one of them is needed BEFORE
   * a session exists: a tech installs the app from the login screen, and a phone whose
   * cookie expired overnight has to be told that rather than shown a browser error.
   * Behind the redirect, an update to the worker fetched HTML where it expected
   * JavaScript and failed without saying so.
   */
  "/sw.js",
  "/manifest.json",
  "/offline.html",
  "/icons",
  // The offline card sets itself in Chivo, so its font has to come down with the
  // rest of the install — behind the sign-in redirect it would fetch HTML instead.
  "/fonts",
];

// Simple in-memory cache for tenant resolution (resets on cold start)
const tenantCache = new Map<string, { plan: string; expiresAt: string | null; status: string; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

/**
 * Where the internal resolve call is sent.
 *
 * This used to be built from the request's own `Host` header while carrying
 * NEXTAUTH_SECRET in a header: a signed-in user could point Host at a listener of their
 * choosing and be handed the master secret, which mints an admin token for any
 * workspace. The address is configuration now, and an unset NEXTAUTH_URL resolves
 * nothing at all rather than trusting the caller.
 */
const INTERNAL_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXTAUTH_URL ?? "").origin;
  } catch {
    return "";
  }
})();

/**
 * Middleware runs on the edge runtime and cannot open the database, so the plan and
 * expiry still come over HTTP — but the endpoint no longer hands out the tenant id, and
 * the answer is cached for a minute.
 */
async function resolveTenant(slug: string) {
  if (!INTERNAL_ORIGIN) return null;

  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  try {
    const res = await fetch(`${INTERNAL_ORIGIN}/api/tenant/resolve?slug=${encodeURIComponent(slug)}`, {
      headers: { "x-internal-resolve": process.env.NEXTAUTH_SECRET ?? "" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = { plan: data.plan, expiresAt: data.expiresAt, status: data.status ?? "ACTIVE", ts: Date.now() };
    tenantCache.set(slug, entry);
    return entry;
  } catch {
    return null;
  }
}

function deny(req: NextRequest, url: URL, pathname: string, status: number) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: status === 403 ? "Forbidden" : "Unauthorized" }, { status });
  }
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const { pathname } = url;

  // Skip static files and public API paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Determine tenant slug from subdomain, or ?tenant= for local development
  const host = req.headers.get("host") ?? "";
  const slug = slugFromHost(host, url.searchParams.get("tenant"));

  // Require authentication
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
    }
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // A Google sign-up that has not named a workspace has a session but no desk. Keep it in
  // the finish room until it does; the finish page and /api/register/google are public,
  // so this only catches attempts to wander into an actual workspace.
  if (token.needsWorkspace) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Finish creating your workspace first" }, { status: 403 });
    }
    url.pathname = "/register/finish";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A Google account whose workspace exists but is not approved yet: the waiting room and
  // nothing else. /pending is public, so this catches only attempts to go past it.
  if (token.pending) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "This workspace is awaiting approval" }, { status: 403 });
    }
    url.pathname = "/pending";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A member who joined through an open link and is not approved yet. The workspace is fine
  // — it is this one person who is still at the door — so they go to /awaiting, not
  // /pending, and their API calls are refused. The guard refuses them too (empty identity),
  // and the jwt callback re-reads approval each request, so the desk opens the moment the
  // owner approves without a fresh sign-in.
  if (token.unapproved) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Your account is waiting for the owner to let you in" }, { status: 403 });
    }
    url.pathname = "/awaiting";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // The workspace in the address must be the one this session belongs to. Without this
  // an expired trial could simply append «?tenant=<some live slug>» and keep working,
  // because the handlers below read the tenant from the session, not from the URL.
  if (token.tenantSlug && token.tenantSlug !== slug) {
    return deny(req, url, pathname, 403);
  }

  const tenant = await resolveTenant(slug);

  if (!tenant) {
    url.pathname = "/register";
    return NextResponse.redirect(url);
  }

  // A workspace that is not open for business — awaiting approval or suspended — shows the
  // waiting room, never the desk. Catches a credentials session too, not just Google.
  if (tenant.status !== "ACTIVE") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "This workspace is not active" }, { status: 403 });
    }
    url.pathname = "/pending";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Check demo expiry — now necessarily the session's own tenant
  if (tenant.plan === "DEMO" && tenant.expiresAt) {
    const expired = new Date(tenant.expiresAt) < new Date();
    if (expired && !pathname.startsWith("/expired")) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Trial expired" }, { status: 402 });
      }
      url.pathname = "/expired";
      url.searchParams.set("slug", slug);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
