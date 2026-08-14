import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Internal only — the middleware asks it for the plan and expiry of a workspace.
 * It used to be public and returned the tenant id, which was the first step of an
 * account takeover: slug → tenant id → sign in as the seeded demo worker.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  if (!secret || req.headers.get("x-internal-resolve") !== secret) {
    return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { slug: true, businessName: true, plan: true, expiresAt: true },
  });

  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(tenant);
}
