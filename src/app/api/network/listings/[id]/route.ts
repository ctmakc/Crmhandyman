import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent, requestIp } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  const action = typeof body.action === "string" ? body.action.trim().toUpperCase() : "";
  if (!new Set(["CLOSE", "REOPEN"]).has(action)) {
    return NextResponse.json({ error: "Unsupported listing action." }, { status: 422 });
  }

  const listing = await prisma.leadListing.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      claims: {
        select: { status: true },
      },
    },
  });

  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

  const activeClaims = listing.claims.filter((claim) =>
    ["APPROVED", "CONTACT_UNLOCKED", "WON", "LOST"].includes(claim.status)
  ).length;

  if (action === "REOPEN") {
    if (activeClaims >= listing.maxClaims || (listing.exclusive && activeClaims > 0)) {
      return NextResponse.json(
        { error: "The listing cannot reopen while its approved claim limit is reached." },
        { status: 409 }
      );
    }
    if (listing.expiresAt && listing.expiresAt <= new Date()) {
      return NextResponse.json({ error: "Extend or recreate an expired listing." }, { status: 409 });
    }
  }

  const nextStatus = action === "CLOSE" ? "CLOSED" : "OPEN";
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.leadListing.update({
      where: { id: listing.id },
      data: { status: nextStatus },
    });
    await recordAuditEvent(
      {
        actor: { type: "USER", id: user.id, email: user.email },
        tenantId: user.tenantId,
        action: `LEAD_LISTING_${action}`,
        targetType: "LEAD_LISTING",
        targetId: listing.id,
        metadata: {
          previousStatus: listing.status,
          nextStatus,
          activeClaims,
          maxClaims: listing.maxClaims,
          exclusive: listing.exclusive,
          expiresAt: listing.expiresAt?.toISOString() ?? null,
        },
        ipAddress: requestIp(req.headers),
      },
      tx
    );
    return saved;
  });

  return NextResponse.json({ listing: updated });
}
