import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

const OWNER_ACTIONS = new Set(["APPROVE", "REJECT", "REFUND"]);
const CLAIMANT_ACTIONS = new Set(["UNLOCK", "WON", "LOST"]);

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
  if (!OWNER_ACTIONS.has(action) && !CLAIMANT_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unsupported claim action." }, { status: 422 });
  }

  const claim = await prisma.leadClaim.findUnique({
    where: { id: params.id },
    include: {
      listing: {
        include: {
          lead: {
            select: {
              name: true,
              phone: true,
              email: true,
              address: true,
              notes: true,
            },
          },
        },
      },
    },
  });

  if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });

  const ownsListing = claim.listing.tenantId === user.tenantId;
  const ownsClaim = claim.tenantId === user.tenantId;

  if (OWNER_ACTIONS.has(action) && !ownsListing) {
    return NextResponse.json({ error: "Only the lead owner can perform this action." }, { status: 403 });
  }
  if (CLAIMANT_ACTIONS.has(action) && !ownsClaim) {
    return NextResponse.json({ error: "Only the claimant can perform this action." }, { status: 403 });
  }

  let nextStatus = claim.status;
  let creditsPaid = claim.creditsPaid;

  if (action === "APPROVE") {
    if (claim.status !== "REQUESTED") {
      return NextResponse.json({ error: "Only requested claims can be approved." }, { status: 409 });
    }
    nextStatus = "APPROVED";
  }

  if (action === "REJECT") {
    if (!new Set(["REQUESTED", "APPROVED"]).has(claim.status)) {
      return NextResponse.json({ error: "This claim can no longer be rejected." }, { status: 409 });
    }
    nextStatus = "REJECTED";
  }

  if (action === "UNLOCK") {
    if (claim.status !== "APPROVED") {
      return NextResponse.json({ error: "The lead owner must approve this request first." }, { status: 409 });
    }
    nextStatus = "CONTACT_UNLOCKED";
    creditsPaid = claim.listing.contactUnlockPriceCredits;
  }

  if (action === "WON") {
    if (!new Set(["CONTACT_UNLOCKED", "LOST"]).has(claim.status)) {
      return NextResponse.json({ error: "Unlock the contact before marking the lead as won." }, { status: 409 });
    }
    nextStatus = "WON";
  }

  if (action === "LOST") {
    if (!new Set(["CONTACT_UNLOCKED", "WON"]).has(claim.status)) {
      return NextResponse.json({ error: "Unlock the contact before marking the lead as lost." }, { status: 409 });
    }
    nextStatus = "LOST";
  }

  if (action === "REFUND") {
    if (!new Set(["CONTACT_UNLOCKED", "WON", "LOST"]).has(claim.status)) {
      return NextResponse.json({ error: "Only an unlocked claim can be refunded." }, { status: 409 });
    }
    nextStatus = "REFUNDED";
    creditsPaid = 0;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.leadClaim.update({
      where: { id: claim.id },
      data: { status: nextStatus, creditsPaid },
    });

    const activeClaims = await tx.leadClaim.count({
      where: {
        listingId: claim.listingId,
        status: { in: ["APPROVED", "CONTACT_UNLOCKED", "WON", "LOST"] },
      },
    });

    const shouldMatch = activeClaims >= claim.listing.maxClaims ||
      (claim.listing.exclusive && activeClaims > 0);

    await tx.leadListing.update({
      where: { id: claim.listingId },
      data: {
        status: shouldMatch ? "MATCHED" : claim.listing.status === "MATCHED" ? "OPEN" : claim.listing.status,
      },
    });

    return saved;
  });

  const contactVisible = ["CONTACT_UNLOCKED", "WON", "LOST", "REFUNDED"].includes(updated.status);

  return NextResponse.json({
    claim: updated,
    contact: contactVisible ? claim.listing.lead : null,
  });
}
