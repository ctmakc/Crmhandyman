import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { slugFromHost } from "@/lib/tenant-slug";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/expired",
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
const tenantCache = new Map<string, { plan: string; expiresAt: string | null; ts: number }>();
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
    const entry = { plan: data.plan, expiresAt: data.expiresAt, ts: Date.now() };
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
