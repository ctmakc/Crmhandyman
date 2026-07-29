import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSuperAdminUser } from "@/lib/super-admin";

type AuditRow = {
  id: string;
  actorType: string;
  actorId: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadataJson: string;
  ipHash: string | null;
  createdAt: Date | string;
  tenantName: string | null;
};

type WebhookRow = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  objectId: string | null;
  payloadSha256: string;
  livemode: boolean | number;
  status: string;
  attempts: number | bigint;
  lastError: string | null;
  receivedAt: Date | string;
  processedAt: Date | string | null;
  updatedAt: Date | string;
};

type CountRow = { key: string; count: number | bigint };

function text(value: string | null, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
}

function parseMetadata(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { invalidJson: true };
  }
}

export async function GET(req: NextRequest) {
  const admin = await getSuperAdminUser();
  if (!admin) return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });

  const query = text(req.nextUrl.searchParams.get("q"), 160).toLowerCase();
  const action = text(req.nextUrl.searchParams.get("action"), 120).toUpperCase();
  const webhookStatus = text(req.nextUrl.searchParams.get("webhookStatus"), 30).toUpperCase();
  const searchPattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const allowedWebhookStatuses = new Set(["RECEIVED", "PROCESSED", "IGNORED", "FAILED"]);
  const webhookStatusFilter = allowedWebhookStatuses.has(webhookStatus) ? webhookStatus : null;

  const [auditRows, webhookRows, auditCounts, webhookCounts] = await Promise.all([
    prisma.$queryRaw<AuditRow[]>(Prisma.sql`
      SELECT
        a."id", a."actorType", a."actorId", a."actorEmail", a."tenantId", a."action",
        a."targetType", a."targetId", a."metadataJson", a."ipHash", a."createdAt",
        t."businessName" AS "tenantName"
      FROM AuditEvent a
      LEFT JOIN Tenant t ON t."id" = a."tenantId"
      WHERE (${action} = '' OR a."action" = ${action})
        AND (${query} = '' OR LOWER(COALESCE(a."actorEmail", '')) LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER(a."action") LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER(a."targetType") LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER(COALESCE(a."targetId", '')) LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER(COALESCE(t."businessName", '')) LIKE ${searchPattern} ESCAPE '\\')
      ORDER BY a."createdAt" DESC
      LIMIT 250
    `),
    prisma.$queryRaw<WebhookRow[]>(Prisma.sql`
      SELECT
        "id", "provider", "eventId", "eventType", "objectId", "payloadSha256",
        "livemode", "status", "attempts", "lastError", "receivedAt", "processedAt", "updatedAt"
      FROM WebhookReceipt
      WHERE (${webhookStatusFilter} IS NULL OR "status" = ${webhookStatusFilter})
        AND (${query} = '' OR LOWER("provider") LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER("eventId") LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER("eventType") LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER(COALESCE("objectId", '')) LIKE ${searchPattern} ESCAPE '\\')
      ORDER BY "updatedAt" DESC
      LIMIT 250
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT "actorType" AS "key", COUNT(*) AS "count"
      FROM AuditEvent
      GROUP BY "actorType"
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT "status" AS "key", COUNT(*) AS "count"
      FROM WebhookReceipt
      GROUP BY "status"
    `),
  ]);

  return NextResponse.json({
    audit: auditRows.map((row) => ({
      ...row,
      metadata: parseMetadata(row.metadataJson),
      metadataJson: undefined,
      ipHash: row.ipHash ? `${row.ipHash.slice(0, 12)}…` : null,
    })),
    webhooks: webhookRows.map((row) => ({
      ...row,
      livemode: Boolean(row.livemode),
      attempts: Number(row.attempts),
      payloadSha256: `${row.payloadSha256.slice(0, 16)}…`,
    })),
    meta: {
      auditCounts: Object.fromEntries(auditCounts.map((row) => [row.key, Number(row.count)])),
      webhookCounts: Object.fromEntries(webhookCounts.map((row) => [row.key, Number(row.count)])),
      auditSelected: auditRows.length,
      webhookSelected: webhookRows.length,
    },
  });
}
