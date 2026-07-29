import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/expired",
  "/directory",
  "/contractors",
  "/pro",
  "/workers",
  "/worker",
  "/jobs",
  "/hire",
  "/api/auth",
  "/api/webhooks",
  "/api/public",
  "/api/internal",
  "/api/tenant/resolve",
  "/api/register",
  "/sitemap.xml",
  "/robots.txt",
  "/_next",
  "/favicon.ico",
];

const RESERVED_SUBDOMAINS = new Set(["www", "app", "admin", "api", "static", "assets"]);

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const tenantCache = new Map<
  string,
  { tenantId: string; plan: string; expiresAt: string | null; ts: number }
>();
const CACHE_TTL = 60_000;

async function resolveTenant(slug: string, baseUrl: string) {
  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  try {
    const res = await fetch(`${baseUrl}/api/tenant/resolve?slug=${encodeURIComponent(slug)}`, {
      headers: { "x-internal-tenant-resolution": "1" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = {
      tenantId: data.id,
      plan: data.plan,
      expiresAt: data.expiresAt,
      ts: Date.now(),
    };
    tenantCache.set(slug, entry);
    return entry;
  } catch {
    return null;
  }
}

function resolveSlug(req: NextRequest): string {
  const devSlug = req.nextUrl.searchParams.get("tenant");
  if (devSlug) return devSlug;

  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const parts = host.split(".").filter(Boolean);

  if (parts.length >= 3) {
    const candidate = parts[0];
    return RESERVED_SUBDOMAINS.has(candidate) ? "demo" : candidate;
  }

  return "demo";
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const { pathname } = url;

  if (isPublicPath(pathname)) return NextResponse.next();

  const slug = resolveSlug(req);
  const baseUrl = `${req.nextUrl.protocol}//${req.headers.get("host")}`;
  const tenant = await resolveTenant(slug, baseUrl);

  if (!tenant) {
    url.pathname = "/register";
    url.searchParams.set("requestedTenant", slug);
    return NextResponse.redirect(url);
  }

  if (tenant.plan === "DEMO" && tenant.expiresAt) {
    const expired = new Date(tenant.expiresAt) < new Date();
    if (expired && !pathname.startsWith("/expired")) {
      url.pathname = "/expired";
      url.searchParams.set("slug", slug);
      return NextResponse.redirect(url);
    }
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token && !pathname.startsWith("/api/")) {
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (!token && pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.next();
  res.headers.set("x-tenant-id", tenant.tenantId);
  res.headers.set("x-tenant-slug", slug);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
