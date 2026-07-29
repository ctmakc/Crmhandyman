import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { recordAuditEvent, requestIp } from "@/lib/audit";
import { refundCredits } from "@/lib/credits";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";
import { isSuperAdminEmail } from "@/lib/super-admin";

const RESOLUTION_ACTIONS = new Set([
  "REQUEST_INFO",
  "RESOLVE_REFUND",
  "RESOLVE_NO_REFUND",
  "CLOSE",
]);
const ACTIVE_CLAIM_STATUSES = ["APPROVED", "CONTACT_UNLOCKED", "WON", "LOST"] as const;

type DisputeRow = {
  id: string;
  claimId: string;
  openedByTenantId: string;
  respondentTenantId: string;
  category: string;
  summary: string;
  status: string;
  resolution: string | null;
  slaDueAt: Date | string;
  listingId: string;
  listingTitle: string;
  ownerTenantId: string;
  claimantTenantId: string;
  claimStatus: string;
  creditsPaid: number;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function evidenceUrls(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]+/)
      : [];
  return Array.from(
    new Set(
      values
        .map((item) => text(item, 500))
        .filter((item) => /^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(item))
        .slice(0, 10)
    )
  );
}

async function findDispute(id: string) {
  const rows = await prisma.$queryRaw<DisputeRow[]>(Prisma.sql`
    SELECT
      d.id,
      d.claimId,
      d.openedByTenantId,
      d.respondentTenantId,
      d.category,
      d.summary,
      d.status,
      d.resolution,
      d.slaDueAt,
      l.id AS listingId,
      l.title AS listingTitle,
      l.tenantId AS ownerTenantId,
      c.tenantId AS claimantTenantId,
      c.status AS claimStatus,
      c.creditsPaid AS creditsPaid
    FROM NetworkDispute d
    JOIN LeadClaim c ON c.id = d.claimId
    JOIN LeadListing l ON l.id = c.listingId
    WHERE d.id = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function restoreListingStatus(tx: Prisma.TransactionClient, listingId: string) {
  const listing = await tx.leadListing.findUnique({
    where: { id: listingId },
    select: { id: true, maxClaims: true, exclusive: true },
  });
  if (!listing) return;

  const activeClaims = await tx.leadClaim.count({
    where: {
      listingId,
      status: { in: [...ACTIVE_CLAIM_STATUSES] },
    },
  });
  const matched = activeClaims >= listing.maxClaims || (listing.exclusive && activeClaims > 0);
  await tx.leadListing.update({
    where: { id: listingId },
    data: { status: matched ? "MATCHED" : "OPEN" },
  });
}

async function notifyParties(
  dispute: DisputeRow,
  subject: string,
  body: string,
  idempotencyPrefix: string
) {
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: [dispute.ownerTenantId, dispute.claimantTenantId] } },
    select: { id: true, businessName: true, ownerEmail: true },
  });
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";

  await Promise.allSettled(
    tenants.map((tenant) =>
      sendOutboundEmail({
        to: tenant.ownerEmail,
        subject,
        idempotencyKey: `${idempotencyPrefix}:${tenant.id}`,
        text: `${body}\n\nReview the case: ${baseUrl}/network/disputes`,
        html: `
          <p>${escapeHtml(body)}</p>
          <p><a href="${escapeHtml(`${baseUrl}/network/disputes`)}">Review the case</a></p>
        `,
      })
    )
  );
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const dispute = await findDispute(params.id);
  if (!dispute) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

  const superAdmin = isSuperAdminEmail(user.email);
  const party =
    dispute.openedByTenantId === user.tenantId || dispute.respondentTenantId === user.tenantId;
  if (!party && !superAdmin) {
    return NextResponse.json({ error: "You are not a party to this dispute." }, { status: 403 });
  }
  if (["RESOLVED", "CLOSED"].includes(dispute.status)) {
    return NextResponse.json({ error: "This dispute is already closed." }, { status: 409 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const message = text(payload.message, 5000);
  const urls = evidenceUrls(payload.evidenceUrls);
  if (message.length < 10) {
    return NextResponse.json(
      { error: "Response must contain at least 10 characters." },
      { status: 422 }
    );
  }

  const now = new Date();
  const messageId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO NetworkDisputeMessage (
        id, disputeId, tenantId, authorEmail, body, evidenceUrls, createdAt
      ) VALUES (
        ${messageId}, ${dispute.id}, ${party ? user.tenantId : null}, ${user.email},
        ${message}, ${JSON.stringify(urls)}, ${now}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE NetworkDispute
      SET status = ${dispute.status === "NEEDS_INFO" && party ? "OPEN" : dispute.status},
          updatedAt = ${now}
      WHERE id = ${dispute.id}
    `);
    await recordAuditEvent(
      {
        actor: { type: "USER", id: user.id, email: user.email },
        tenantId: user.tenantId,
        action: "NETWORK_DISPUTE_MESSAGE_ADDED",
        targetType: "NETWORK_DISPUTE",
        targetId: dispute.id,
        metadata: {
          messageId,
          evidenceCount: urls.length,
          party,
          superAdmin,
        },
        ipAddress: requestIp(req.headers),
      },
      tx
    );
  });

  const otherTenantId =
    dispute.openedByTenantId === user.tenantId
      ? dispute.respondentTenantId
      : dispute.openedByTenantId;
  const otherTenant = await prisma.tenant.findUnique({
    where: { id: otherTenantId },
    select: { ownerEmail: true },
  });
  if (otherTenant) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
    try {
      await sendOutboundEmail({
        to: otherTenant.ownerEmail,
        subject: `New response in dispute: ${dispute.listingTitle}`,
        idempotencyKey: `dispute-response:${dispute.id}:${messageId}:${otherTenantId}`,
        text: `${message}\n\nReview the case: ${baseUrl}/network/disputes`,
        html: `<p style="white-space:pre-line">${escapeHtml(message)}</p><p><a href="${escapeHtml(`${baseUrl}/network/disputes`)}">Review the case</a></p>`,
      });
    } catch (error) {
      console.error("Dispute response notification failed", error);
    }
  }

  return NextResponse.json({
    message: {
      id: messageId,
      disputeId: dispute.id,
      tenantId: party ? user.tenantId : null,
      authorEmail: user.email,
      body: message,
      evidenceUrls: urls,
      createdAt: now,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAppSessionUser();
  if (!user || !isSuperAdminEmail(user.email)) {
    return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const action = text(payload.action, 60).toUpperCase();
  const resolution = text(payload.resolution, 5000);
  if (!RESOLUTION_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unsupported resolution action." }, { status: 422 });
  }
  if (resolution.length < 10) {
    return NextResponse.json(
      { error: "Resolution note must contain at least 10 characters." },
      { status: 422 }
    );
  }

  const dispute = await findDispute(params.id);
  if (!dispute) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
  if (["RESOLVED", "CLOSED"].includes(dispute.status)) {
    return NextResponse.json({ error: "This dispute is already closed." }, { status: 409 });
  }

  const now = new Date();
  let walletBalance: number | null = null;
  let refundTransactionId: string | null = null;
  const nextStatus = action === "REQUEST_INFO" ? "NEEDS_INFO" : action === "CLOSE" ? "CLOSED" : "RESOLVED";

  await prisma.$transaction(async (tx) => {
    if (action === "RESOLVE_REFUND") {
      const claim = await tx.leadClaim.findUnique({
        where: { id: dispute.claimId },
        select: { id: true, tenantId: true, creditsPaid: true, status: true },
      });
      if (!claim) throw new Error("CLAIM_NOT_FOUND");

      const refund = await refundCredits(tx, {
        tenantId: claim.tenantId,
        amount: claim.creditsPaid,
        idempotencyKey: `dispute-refund:${dispute.id}`,
        referenceType: "NETWORK_DISPUTE",
        referenceId: dispute.id,
        description: `Dispute refund for ${dispute.listingTitle}`,
      });
      walletBalance = refund.wallet.balance;
      refundTransactionId = refund.transaction.id;
      await tx.leadClaim.update({
        where: { id: claim.id },
        data: { status: "REFUNDED", creditsPaid: 0 },
      });
    }

    if (action !== "REQUEST_INFO") {
      await restoreListingStatus(tx, dispute.listingId);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE NetworkDispute
      SET status = ${nextStatus},
          resolution = ${resolution},
          resolvedByEmail = ${user.email},
          updatedAt = ${now}
      WHERE id = ${dispute.id}
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO NetworkDisputeMessage (
        id, disputeId, tenantId, authorEmail, body, evidenceUrls, createdAt
      ) VALUES (
        ${randomUUID()}, ${dispute.id}, NULL, ${user.email}, ${resolution}, '[]', ${now}
      )
    `);
    await recordAuditEvent(
      {
        actor: { type: "USER", id: user.id, email: user.email },
        tenantId: user.tenantId,
        action: `NETWORK_DISPUTE_${action}`,
        targetType: "NETWORK_DISPUTE",
        targetId: dispute.id,
        metadata: {
          previousStatus: dispute.status,
          nextStatus,
          listingId: dispute.listingId,
          claimId: dispute.claimId,
          refundTransactionId,
          walletBalance,
          resolution,
        },
        ipAddress: requestIp(req.headers),
      },
      tx
    );
  });

  await notifyParties(
    dispute,
    `Dispute ${nextStatus.toLowerCase()}: ${dispute.listingTitle}`,
    action === "RESOLVE_REFUND"
      ? `The dispute was resolved with a refund. ${resolution}`
      : action === "RESOLVE_NO_REFUND"
        ? `The dispute was resolved without a refund. ${resolution}`
        : action === "REQUEST_INFO"
          ? `Additional information was requested. ${resolution}`
          : `The dispute was closed. ${resolution}`,
    `dispute-resolution:${dispute.id}:${action}`
  );

  return NextResponse.json({
    dispute: {
      id: dispute.id,
      status: nextStatus,
      resolution,
      resolvedByEmail: user.email,
      updatedAt: now,
    },
    walletBalance,
  });
}
