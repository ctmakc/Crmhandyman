import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, businessName: true, plan: true, expiresAt: true },
  });

  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(tenant);
}
