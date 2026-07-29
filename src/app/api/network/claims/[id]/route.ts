import { NextRequest, NextResponse } from "next/server";
import { recordAuditEvent, requestIp } from "@/lib/audit";
import { InsufficientCreditsError, debitCredits, refundCredits } from "@/lib/credits";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

const OWNER_ACTIONS = new Set(["APPROVE", "REJECT", "REFUND"]);
const CLAIMANT_ACTIONS = new Set(["UNLOCK", "WON", "LOST"]);
const ACTIVE_CLAIM_STATUSES = ["APPROVED", "CONTACT_UNLOCKED", "WON", "LOST"] as const;

function actionMessage(input: {
  action: string;
  listingTitle: string;
  ownerBusinessName: string;
  claimantBusinessName: string;
  credits: number;
  city: string;
  province: string;
}) {
  const location = `${input.city}, ${input.province}`;
  const messages: Record<string, { subject: string; text: string }> = {
    APPROVE: {
      subject: `Claim approved: ${input.listingTitle}`,
      text: `${input.ownerBusinessName} approved your request. You can now unlock the customer contact for ${input.credits} credits.`,
    },
    REJECT: {
      subject: `Claim declined: ${input.listingTitle}`,
      text: `${input.ownerBusinessName} declined your request for this lead listing.`,
    },
    UNLOCK: {
      subject: `Lead contact unlocked: ${input.listingTitle}`,
      text: `${input.claimantBusinessName} unlocked the customer contact for ${input.credits} credits.`,
    },
    WON: {
      subject: `Lead marked won: ${input.listingTitle}`,
      text: `${input.claimantBusinessName} marked this lead as won.`,
    },
    LOST: {
      subject: `Lead marked lost: ${input.listingTitle}`,
      text: `${input.claimantBusinessName} marked this lead as lost.`,
    },
    REFUND: {
      subject: `Lead credits refunded: ${input.listingTitle}`,
      text: `${input.ownerBusinessName} refunded ${input.credits} credits for this lead claim.`,
    },
  };
  const selected = messages[input.action];
  return selected ? { ...selected, location } : null;
}

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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.leadClaim.findUnique({
        where: { id: params.id },
        include: {
          claimedBy: {
            select: { id: true, businessName: true, ownerEmail: true },
          },
          listing: {
            include: {
              tenant: {
                select: { id: true, businessName: true, ownerEmail: true },
              },
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

      if (!claim) throw new Error("NOT_FOUND");

      const ownsListing = claim.listing.tenantId === user.tenantId;
      const ownsClaim = claim.tenantId === user.tenantId;

      if (OWNER_ACTIONS.has(action) && !ownsListing) throw new Error("OWNER_REQUIRED");
      if (CLAIMANT_ACTIONS.has(action) && !ownsClaim) throw new Error("CLAIMANT_REQUIRED");

      let nextStatus = claim.status;
      let creditsPaid = claim.creditsPaid;
      let walletBalance: number | null = null;
      let creditTransactionId: string | null = null;
      let creditReplayed = false;
      const creditsBefore = claim.creditsPaid;

      if (action === "APPROVE") {
        if (claim.status !== "REQUESTED") throw new Error("APPROVE_STATE");

        const activeOtherClaims = await tx.leadClaim.count({
          where: {
            listingId: claim.listingId,
            id: { not: claim.id },
            status: { in: [...ACTIVE_CLAIM_STATUSES] },
          },
        });
        if (
          activeOtherClaims >= claim.listing.maxClaims ||
          (claim.listing.exclusive && activeOtherClaims > 0)
        ) {
          throw new Error("CLAIM_LIMIT");
        }
        nextStatus = "APPROVED";
      }

      if (action === "REJECT") {
        if (!new Set(["REQUESTED", "APPROVED"]).has(claim.status)) {
          throw new Error("REJECT_STATE");
        }
        nextStatus = "REJECTED";
      }

      if (action === "UNLOCK") {
        if (claim.status !== "APPROVED") throw new Error("UNLOCK_STATE");

        const price = claim.listing.contactUnlockPriceCredits;
        const debit = await debitCredits(tx, {
          tenantId: claim.tenantId,
          amount: price,
          idempotencyKey: `lead-unlock:${claim.id}`,
          referenceType: "LEAD_CLAIM",
          referenceId: claim.id,
          description: `Unlocked contact for ${claim.listing.title}`,
        });
        walletBalance = debit.wallet.balance;
        creditTransactionId = debit.transaction.id;
        creditReplayed = debit.replayed;
        creditsPaid = price;
        nextStatus = "CONTACT_UNLOCKED";
      }

      if (action === "WON") {
        if (!new Set(["CONTACT_UNLOCKED", "LOST"]).has(claim.status)) {
          throw new Error("WON_STATE");
        }
        nextStatus = "WON";
      }

      if (action === "LOST") {
        if (!new Set(["CONTACT_UNLOCKED", "WON"]).has(claim.status)) {
          throw new Error("LOST_STATE");
        }
        nextStatus = "LOST";
      }

      if (action === "REFUND") {
        if (!new Set(["CONTACT_UNLOCKED", "WON", "LOST"]).has(claim.status)) {
          throw new Error("REFUND_STATE");
        }

        const refund = await refundCredits(tx, {
          tenantId: claim.tenantId,
          amount: claim.creditsPaid,
          idempotencyKey: `lead-refund:${claim.id}`,
          referenceType: "LEAD_CLAIM",
          referenceId: claim.id,
          description: `Refunded contact unlock for ${claim.listing.title}`,
        });
        if (ownsClaim) walletBalance = refund.wallet.balance;
        creditTransactionId = refund.transaction.id;
        creditReplayed = refund.replayed;
        nextStatus = "REFUNDED";
        creditsPaid = 0;
      }

      const updated = await tx.leadClaim.update({
        where: { id: claim.id },
        data: { status: nextStatus, creditsPaid },
      });

      const activeClaims = await tx.leadClaim.count({
        where: {
          listingId: claim.listingId,
          status: { in: [...ACTIVE_CLAIM_STATUSES] },
        },
      });
      const shouldMatch =
        activeClaims >= claim.listing.maxClaims ||
        (claim.listing.exclusive && activeClaims > 0);

      await tx.leadListing.update({
        where: { id: claim.listingId },
        data: {
          status: shouldMatch
            ? "MATCHED"
            : claim.listing.status === "MATCHED"
              ? "OPEN"
              : claim.listing.status,
        },
      });

      await recordAuditEvent(
        {
          actor: { type: "USER", id: user.id, email: user.email },
          tenantId: user.tenantId,
          action: `LEAD_CLAIM_${action}`,
          targetType: "LEAD_CLAIM",
          targetId: claim.id,
          metadata: {
            listingId: claim.listingId,
            previousStatus: claim.status,
            nextStatus,
            claimantTenantId: claim.tenantId,
            ownerTenantId: claim.listing.tenantId,
            creditsPaidBefore: claim.creditsPaid,
            creditsPaidAfter: creditsPaid,
            creditTransactionId,
            creditReplayed,
            walletBalance: ownsClaim ? walletBalance : null,
          },
          ipAddress: requestIp(req.headers),
        },
        tx
      );

      const contactVisible = ["CONTACT_UNLOCKED", "WON", "LOST", "REFUNDED"].includes(
        updated.status
      );
      const notifyClaimant = ["APPROVE", "REJECT", "REFUND"].includes(action);

      return {
        claim: updated,
        contact: contactVisible ? claim.listing.lead : null,
        walletBalance,
        notification: {
          to: notifyClaimant ? claim.claimedBy.ownerEmail : claim.listing.tenant.ownerEmail,
          ownerBusinessName: claim.listing.tenant.businessName,
          claimantBusinessName: claim.claimedBy.businessName,
          listingTitle: claim.listing.title,
          city: claim.listing.city,
          province: claim.listing.province,
          credits:
            action === "REFUND"
              ? creditsBefore
              : claim.listing.contactUnlockPriceCredits,
        },
      };
    });

    const notification = actionMessage({ action, ...result.notification });
    if (notification) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
      try {
        await sendOutboundEmail({
          to: result.notification.to,
          subject: notification.subject,
          idempotencyKey: `lead-claim-action:${result.claim.id}:${action}`,
          text: [
            notification.text,
            `Lead: ${result.notification.listingTitle}`,
            `Location: ${notification.location}`,
            "",
            `Open the lead network: ${baseUrl}/network`,
          ].join("\n"),
          html: `
            <p>${escapeHtml(notification.text)}</p>
            <p><strong>Lead:</strong> ${escapeHtml(result.notification.listingTitle)}<br>
            <strong>Location:</strong> ${escapeHtml(notification.location)}</p>
            <p><a href="${escapeHtml(`${baseUrl}/network`)}">Open the lead network</a></p>
          `,
        });
      } catch (emailError) {
        console.error("Lead claim action notification failed", emailError);
      }
    }

    return NextResponse.json({
      claim: result.claim,
      contact: result.contact,
      walletBalance: result.walletBalance,
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: "Insufficient credits to unlock this lead.",
          required: error.required,
          available: error.available,
        },
        { status: 402 }
      );
    }

    const code = error instanceof Error ? error.message : "";
    const responses: Record<string, [string, number]> = {
      NOT_FOUND: ["Claim not found.", 404],
      OWNER_REQUIRED: ["Only the lead owner can perform this action.", 403],
      CLAIMANT_REQUIRED: ["Only the claimant can perform this action.", 403],
      APPROVE_STATE: ["Only requested claims can be approved.", 409],
      REJECT_STATE: ["This claim can no longer be rejected.", 409],
      UNLOCK_STATE: ["The lead owner must approve this request first.", 409],
      WON_STATE: ["Unlock the contact before marking the lead as won.", 409],
      LOST_STATE: ["Unlock the contact before marking the lead as lost.", 409],
      REFUND_STATE: ["Only an unlocked claim can be refunded.", 409],
      CLAIM_LIMIT: ["The listing has reached its approved claim limit.", 409],
    };
    const [message, status] = responses[code] ?? ["Unable to update lead claim.", 500];
    if (status === 500) console.error("Lead claim action failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}
