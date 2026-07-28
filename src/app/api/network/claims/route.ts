import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
  if (!listingId) return NextResponse.json({ error: "Listing ID is required." }, { status: 422 });

  try {
    const claim = await prisma.$transaction(async (tx) => {
      const listing = await tx.leadListing.findUnique({
        where: { id: listingId },
        include: {
          claims: {
            select: { tenantId: true, status: true },
          },
        },
      });

      if (!listing) throw new Error("NOT_FOUND");
      if (listing.tenantId === user.tenantId) throw new Error("OWN_LISTING");
      if (listing.status !== "OPEN") throw new Error("NOT_OPEN");
      if (listing.expiresAt && listing.expiresAt <= new Date()) throw new Error("EXPIRED");

      const existing = listing.claims.find((item) => item.tenantId === user.tenantId);
      if (existing) throw new Error("DUPLICATE");

      const activeClaims = listing.claims.filter((item) => item.status !== "REJECTED").length;
      if (listing.exclusive && activeClaims > 0) throw new Error("FULL");
      if (activeClaims >= listing.maxClaims) throw new Error("FULL");

      return tx.leadClaim.create({
        data: {
          listingId,
          tenantId: user.tenantId,
          status: "REQUESTED",
        },
      });
    });

    return NextResponse.json({ claim }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "You already requested this lead." }, { status: 409 });
    }

    const code = error instanceof Error ? error.message : "";
    const responses: Record<string, [string, number]> = {
      NOT_FOUND: ["Listing not found.", 404],
      OWN_LISTING: ["You cannot claim your own lead.", 409],
      NOT_OPEN: ["This lead is no longer open.", 409],
      EXPIRED: ["This lead has expired.", 409],
      DUPLICATE: ["You already requested this lead.", 409],
      FULL: ["This listing has reached its claim limit.", 409],
    };
    const [message, status] = responses[code] ?? ["Unable to request lead.", 500];
    return NextResponse.json({ error: message }, { status });
  }
}
