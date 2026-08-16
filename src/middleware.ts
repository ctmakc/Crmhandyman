import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/expired",
  "/pay",
  "/api/auth",
  "/api/webhooks",
  "/api/intake",
  "/api/payments/stripe",
  "/api/health",
  "/api/tenant/resolve",
  "/api/register",
  "/_next",
  "/favicon.ico",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Simple in-memory cache for tenant resolution (resets on cold start)
const tenantCache = new Map<string, { tenantId: string; plan: string; expiresAt: string | null; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

async function resolveTenant(slug: string, baseUrl: string) {
  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  try {
    const res = await fetch(`${baseUrl}/api/tenant/resolve?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const entry = { tenantId: data.id, plan: data.plan, expiresAt: data.expiresAt, ts: Date.now() };
    tenantCache.set(slug, entry);
    return entry;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const { pathname } = url;

  // Skip static files and deliberately public API paths. Public mutation endpoints
  // must enforce their own signature/provider verification before touching data.
  // /pay and /api/payments/stripe are safe to expose because every invoice request
  // is bound to a HMAC token and Stripe webhook writes are separately provider-signed.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Determine tenant slug from subdomain or query param (local dev)
  const host = req.headers.get("host") ?? "";
  const devSlug = url.searchParams.get("tenant");

  let slug: string | null = devSlug;
  if (!slug) {
    const parts = host.split(".");
    if (parts.length >= 3) {
      // subdomain: <slug>.domain.com
      slug = parts[0];
    } else {
      // localhost or single-part host — default to "demo"
      slug = "demo";
    }
  }

  // Resolve tenant from DB
  const baseUrl = `${req.nextUrl.protocol}//${req.headers.get("host")}`;
  const tenant = await resolveTenant(slug, baseUrl);

  if (!tenant) {
    url.pathname = "/register";
    return NextResponse.redirect(url);
  }

  // Check demo expiry
  if (tenant.plan === "DEMO" && tenant.expiresAt) {
    const expired = new Date(tenant.expiresAt) < new Date();
    if (expired && !pathname.startsWith("/expired")) {
      url.pathname = "/expired";
      url.searchParams.set("slug", slug);
      return NextResponse.redirect(url);
    }
  }

  // Require authentication
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token && !pathname.startsWith("/api/")) {
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (!token && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pass tenant ID to downstream handlers
  const res = NextResponse.next();
  res.headers.set("x-tenant-id", tenant.tenantId);
  res.headers.set("x-tenant-slug", slug);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
