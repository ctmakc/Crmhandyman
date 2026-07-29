import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { recordAuditEvent, requestIp } from "@/lib/audit";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

function sqliteTriggerMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const candidate = error as {
    meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } };
  };
  return candidate.meta?.driverAdapterError?.cause?.originalMessage ?? "";
}

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
    const result = await prisma.$transaction(async (tx) => {
      const [listing, claimant] = await Promise.all([
        tx.leadListing.findUnique({
          where: { id: listingId },
          include: {
            tenant: {
              select: { id: true, businessName: true, ownerEmail: true },
            },
            claims: {
              select: { tenantId: true, status: true },
            },
          },
        }),
        tx.tenant.findUnique({
          where: { id: user.tenantId },
          select: { id: true, businessName: true },
        }),
      ]);

      if (!listing) throw new Error("NOT_FOUND");
      if (!claimant) throw new Error("CLAIMANT_NOT_FOUND");
      if (listing.tenantId === user.tenantId) throw new Error("OWN_LISTING");
      if (listing.status !== "OPEN") throw new Error("NOT_OPEN");
      if (listing.expiresAt && listing.expiresAt <= new Date()) throw new Error("EXPIRED");

      const existing = listing.claims.find((item) => item.tenantId === user.tenantId);
      if (existing) throw new Error("DUPLICATE");

      const activeClaims = listing.claims.filter((item) =>
        ["REQUESTED", "APPROVED", "CONTACT_UNLOCKED", "WON", "LOST"].includes(item.status)
      ).length;
      if (listing.exclusive && activeClaims > 0) throw new Error("FULL");
      if (activeClaims >= listing.maxClaims) throw new Error("FULL");

      const created = await tx.leadClaim.create({
        data: {
          listingId,
          tenantId: user.tenantId,
          status: "REQUESTED",
        },
      });

      await recordAuditEvent(
        {
          actor: { type: "USER", id: user.id, email: user.email },
          tenantId: user.tenantId,
          action: "LEAD_CLAIM_REQUESTED",
          targetType: "LEAD_CLAIM",
          targetId: created.id,
          metadata: {
            listingId,
            ownerTenantId: listing.tenantId,
            exclusive: listing.exclusive,
            maxClaims: listing.maxClaims,
            activeClaimsBefore: activeClaims,
          },
          ipAddress: requestIp(req.headers),
        },
        tx
      );

      return {
        claim: created,
        notification: {
          ownerEmail: listing.tenant.ownerEmail,
          ownerBusinessName: listing.tenant.businessName,
          claimantBusinessName: claimant.businessName,
          listingTitle: listing.title,
          city: listing.city,
          province: listing.province,
          unlockPrice: listing.contactUnlockPriceCredits,
        },
      };
    });

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
    try {
      await sendOutboundEmail({
        to: result.notification.ownerEmail,
        subject: `New claim request: ${result.notification.listingTitle}`,
        idempotencyKey: `lead-claim-requested:${result.claim.id}:owner`,
        text: [
          `${result.notification.claimantBusinessName} requested your lead listing.`,
          `Lead: ${result.notification.listingTitle}`,
          `Location: ${result.notification.city}, ${result.notification.province}`,
          `Contact unlock price: ${result.notification.unlockPrice} credits`,
          "",
          `Review the request: ${baseUrl}/network`,
        ].join("\n"),
        html: `
          <p><strong>${escapeHtml(result.notification.claimantBusinessName)}</strong> requested your lead listing.</p>
          <p><strong>Lead:</strong> ${escapeHtml(result.notification.listingTitle)}<br>
          <strong>Location:</strong> ${escapeHtml(`${result.notification.city}, ${result.notification.province}`)}<br>
          <strong>Contact unlock price:</strong> ${result.notification.unlockPrice} credits</p>
          <p><a href="${escapeHtml(`${baseUrl}/network`)}">Review the request</a></p>
        `,
      });
    } catch (error) {
      console.error("Lead claim request notification failed", error);
    }

    return NextResponse.json({ claim: result.claim }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "You already requested this lead." }, { status: 409 });
    }

    const triggerMessage = sqliteTriggerMessage(error);
    if (triggerMessage.includes("cannot claim its own")) {
      return NextResponse.json({ error: "You cannot claim your own lead." }, { status: 409 });
    }
    if (triggerMessage.includes("not open")) {
      return NextResponse.json({ error: "This lead is no longer open." }, { status: 409 });
    }
    if (triggerMessage.includes("expired")) {
      return NextResponse.json({ error: "This lead has expired." }, { status: 409 });
    }
    if (triggerMessage.includes("claim limit") || triggerMessage.includes("already has a claim")) {
      return NextResponse.json({ error: "This listing has reached its claim limit." }, { status: 409 });
    }

    const code = error instanceof Error ? error.message : "";
    const responses: Record<string, [string, number]> = {
      NOT_FOUND: ["Listing not found.", 404],
      CLAIMANT_NOT_FOUND: ["Claimant workspace not found.", 404],
      OWN_LISTING: ["You cannot claim your own lead.", 409],
      NOT_OPEN: ["This lead is no longer open.", 409],
      EXPIRED: ["This lead has expired.", 409],
      DUPLICATE: ["You already requested this lead.", 409],
      FULL: ["This listing has reached its claim limit.", 409],
    };
    const [message, status] = responses[code] ?? ["Unable to request lead.", 500];
    if (status === 500) console.error("Lead claim request failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}
