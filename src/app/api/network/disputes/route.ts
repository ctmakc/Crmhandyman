import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { escapeHtml, sendOutboundEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";
import { isSuperAdminEmail } from "@/lib/super-admin";

const CATEGORIES = new Set([
  "INVALID_CONTACT",
  "DUPLICATE_LEAD",
  "WRONG_SCOPE",
  "CUSTOMER_UNAVAILABLE",
  "MISREPRESENTED_BUDGET",
  "OTHER",
]);
const DISPUTABLE_CLAIM_STATUSES = ["APPROVED", "CONTACT_UNLOCKED", "WON", "LOST"] as const;

type DisputeRow = {
  id: string;
  claimId: string;
  openedByTenantId: string;
  respondentTenantId: string;
  category: string;
  summary: string;
  evidenceUrls: string;
  status: string;
  resolution: string | null;
  resolvedByEmail: string | null;
  slaDueAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  listingTitle: string;
  listingId: string;
  claimStatus: string;
  creditsPaid: number;
  openerName: string;
  respondentName: string;
};

type MessageRow = {
  id: string;
  disputeId: string;
  tenantId: string | null;
  authorEmail: string | null;
  body: string;
  evidenceUrls: string;
  createdAt: Date | string;
  tenantName: string | null;
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

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function listDisputes(tenantId: string, includeAll: boolean) {
  const base = Prisma.sql`
    SELECT
      d.*,
      l.title AS listingTitle,
      l.id AS listingId,
      c.status AS claimStatus,
      c.creditsPaid AS creditsPaid,
      opener.businessName AS openerName,
      respondent.businessName AS respondentName
    FROM NetworkDispute d
    JOIN LeadClaim c ON c.id = d.claimId
    JOIN LeadListing l ON l.id = c.listingId
    JOIN Tenant opener ON opener.id = d.openedByTenantId
    JOIN Tenant respondent ON respondent.id = d.respondentTenantId
  `;

  const disputes = includeAll
    ? await prisma.$queryRaw<DisputeRow[]>(Prisma.sql`${base} ORDER BY d.createdAt DESC LIMIT 250`)
    : await prisma.$queryRaw<DisputeRow[]>(
        Prisma.sql`${base} WHERE d.openedByTenantId = ${tenantId} OR d.respondentTenantId = ${tenantId} ORDER BY d.createdAt DESC LIMIT 250`
      );

  const ids = disputes.map((dispute) => dispute.id);
  const messages = ids.length
    ? await prisma.$queryRaw<MessageRow[]>(Prisma.sql`
        SELECT m.*, t.businessName AS tenantName
        FROM NetworkDisputeMessage m
        LEFT JOIN Tenant t ON t.id = m.tenantId
        WHERE m.disputeId IN (${Prisma.join(ids)})
        ORDER BY m.createdAt ASC
      `)
    : [];
  const messagesByDispute = new Map<string, MessageRow[]>();
  for (const message of messages) {
    const current = messagesByDispute.get(message.disputeId) ?? [];
    current.push(message);
    messagesByDispute.set(message.disputeId, current);
  }

  return disputes.map((dispute) => ({
    ...dispute,
    evidenceUrls: parseJsonArray(dispute.evidenceUrls),
    messages: (messagesByDispute.get(dispute.id) ?? []).map((message) => ({
      ...message,
      evidenceUrls: parseJsonArray(message.evidenceUrls),
    })),
  }));
}

export async function GET(req: NextRequest) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const includeAll =
    req.nextUrl.searchParams.get("scope") === "all" && isSuperAdminEmail(user.email);
  const [disputes, claimOptions] = await Promise.all([
    listDisputes(user.tenantId, includeAll),
    prisma.leadClaim.findMany({
      where: {
        status: { in: [...DISPUTABLE_CLAIM_STATUSES] },
        OR: [
          { tenantId: user.tenantId },
          { listing: { tenantId: user.tenantId } },
        ],
      },
      include: {
        claimedBy: { select: { id: true, businessName: true } },
        listing: {
          include: {
            tenant: { select: { id: true, businessName: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    }),
  ]);

  const disputedClaimIds = new Set(disputes.map((dispute) => dispute.claimId));
  const eligibleClaims = claimOptions
    .filter((claim) => !disputedClaimIds.has(claim.id))
    .map((claim) => ({
      id: claim.id,
      status: claim.status,
      creditsPaid: claim.creditsPaid,
      listing: {
        id: claim.listing.id,
        title: claim.listing.title,
        city: claim.listing.city,
        province: claim.listing.province,
        owner: claim.listing.tenant.businessName,
      },
      claimant: claim.claimedBy.businessName,
      role: claim.tenantId === user.tenantId ? "CLAIMANT" : "OWNER",
    }));

  return NextResponse.json({
    data: disputes,
    eligibleClaims,
    isSuperAdmin: isSuperAdminEmail(user.email),
    meta: {
      count: disputes.length,
      overdue: disputes.filter(
        (dispute) =>
          !["RESOLVED", "CLOSED"].includes(dispute.status) &&
          new Date(dispute.slaDueAt).getTime() < Date.now()
      ).length,
    },
  });
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

  const claimId = text(body.claimId, 100);
  const category = text(body.category, 60).toUpperCase();
  const summary = text(body.summary, 5000);
  const urls = evidenceUrls(body.evidenceUrls);

  const errors: string[] = [];
  if (!claimId) errors.push("Select a lead claim.");
  if (!CATEGORIES.has(category)) errors.push("Select a supported dispute category.");
  if (summary.length < 30) errors.push("Describe the dispute in at least 30 characters.");
  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const claim = await prisma.leadClaim.findUnique({
    where: { id: claimId },
    include: {
      claimedBy: { select: { id: true, businessName: true, ownerEmail: true } },
      listing: {
        include: {
          tenant: { select: { id: true, businessName: true, ownerEmail: true } },
        },
      },
    },
  });
  if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  if (!DISPUTABLE_CLAIM_STATUSES.includes(claim.status as (typeof DISPUTABLE_CLAIM_STATUSES)[number])) {
    return NextResponse.json({ error: "This claim cannot be disputed in its current state." }, { status: 409 });
  }

  const isClaimant = claim.tenantId === user.tenantId;
  const isOwner = claim.listing.tenantId === user.tenantId;
  if (!isClaimant && !isOwner) {
    return NextResponse.json({ error: "You are not a party to this claim." }, { status: 403 });
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM NetworkDispute WHERE claimId = ${claim.id} LIMIT 1
  `);
  if (existing.length) {
    return NextResponse.json({ error: "A dispute already exists for this claim." }, { status: 409 });
  }

  const id = randomUUID();
  const messageId = randomUUID();
  const openedByTenantId = user.tenantId;
  const respondentTenantId = isClaimant ? claim.listing.tenantId : claim.tenantId;
  const now = new Date();
  const slaDueAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO NetworkDispute (
        id, claimId, openedByTenantId, respondentTenantId, category, summary,
        evidenceUrls, status, slaDueAt, createdAt, updatedAt
      ) VALUES (
        ${id}, ${claim.id}, ${openedByTenantId}, ${respondentTenantId}, ${category}, ${summary},
        ${JSON.stringify(urls)}, 'OPEN', ${slaDueAt}, ${now}, ${now}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO NetworkDisputeMessage (
        id, disputeId, tenantId, authorEmail, body, evidenceUrls, createdAt
      ) VALUES (
        ${messageId}, ${id}, ${user.tenantId}, ${user.email}, ${summary}, ${JSON.stringify(urls)}, ${now}
      )
    `);
    await tx.leadListing.update({
      where: { id: claim.listingId },
      data: { status: "DISPUTED" },
    });
  });

  const respondent = isClaimant ? claim.listing.tenant : claim.claimedBy;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  try {
    await sendOutboundEmail({
      to: respondent.ownerEmail,
      subject: `Lead network dispute opened: ${claim.listing.title}`,
      text: [
        `A dispute was opened by ${isClaimant ? claim.claimedBy.businessName : claim.listing.tenant.businessName}.`,
        `Category: ${category.replaceAll("_", " ")}`,
        `Lead: ${claim.listing.title}`,
        "",
        summary,
        "",
        `Review and respond: ${baseUrl}/network/disputes`,
        `SLA due: ${slaDueAt.toISOString()}`,
      ].join("\n"),
      html: `
        <p>A dispute was opened for <strong>${escapeHtml(claim.listing.title)}</strong>.</p>
        <p><strong>Category:</strong> ${escapeHtml(category.replaceAll("_", " "))}<br>
        <strong>SLA due:</strong> ${escapeHtml(slaDueAt.toISOString())}</p>
        <p style="white-space:pre-line">${escapeHtml(summary)}</p>
        <p><a href="${escapeHtml(`${baseUrl}/network/disputes`)}">Review and respond</a></p>
      `,
    });
  } catch (error) {
    console.error("Dispute notification failed", error);
  }

  return NextResponse.json(
    {
      dispute: {
        id,
        claimId: claim.id,
        status: "OPEN",
        category,
        slaDueAt,
      },
    },
    { status: 201 }
  );
}
