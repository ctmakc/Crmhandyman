import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { processDueOutboundEmails } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getSuperAdminUser } from "@/lib/super-admin";

type OutboxRow = {
  id: string;
  idempotencyKey: string;
  toEmail: string;
  replyTo: string | null;
  subject: string;
  status: string;
  attempts: number | bigint;
  maxAttempts: number | bigint;
  nextAttemptAt: Date | string;
  lockedAt: Date | string | null;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  sentAt: Date | string | null;
};

type StatusCount = {
  status: string;
  count: number | bigint;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(req: NextRequest) {
  const admin = await getSuperAdminUser();
  if (!admin) return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });

  const status = text(req.nextUrl.searchParams.get("status"), 30).toUpperCase();
  const search = text(req.nextUrl.searchParams.get("q"), 160).toLowerCase();
  const allowedStatuses = new Set(["PENDING", "SENDING", "SENT", "FAILED"]);
  const statusFilter = allowedStatuses.has(status) ? status : null;
  const searchPattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

  const [counts, rows] = await Promise.all([
    prisma.$queryRaw<StatusCount[]>(Prisma.sql`
      SELECT "status", COUNT(*) AS "count"
      FROM EmailOutbox
      GROUP BY "status"
      ORDER BY "status"
    `),
    prisma.$queryRaw<OutboxRow[]>(Prisma.sql`
      SELECT
        "id", "idempotencyKey", "toEmail", "replyTo", "subject", "status", "attempts",
        "maxAttempts", "nextAttemptAt", "lockedAt", "lastError", "providerMessageId",
        "createdAt", "updatedAt", "sentAt"
      FROM EmailOutbox
      WHERE (${statusFilter} IS NULL OR "status" = ${statusFilter})
        AND (${search} = '' OR LOWER("toEmail") LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER("subject") LIKE ${searchPattern} ESCAPE '\\'
          OR LOWER("idempotencyKey") LIKE ${searchPattern} ESCAPE '\\')
      ORDER BY
        CASE "status" WHEN 'FAILED' THEN 0 WHEN 'PENDING' THEN 1 WHEN 'SENDING' THEN 2 ELSE 3 END,
        "updatedAt" DESC
      LIMIT 250
    `),
  ]);

  const countMap = Object.fromEntries(counts.map((item) => [item.status, Number(item.count)]));
  const now = Date.now();
  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.maxAttempts),
      overdue:
        row.status === "PENDING" && new Date(row.nextAttemptAt).getTime() <= now,
    })),
    meta: {
      counts: {
        pending: countMap.PENDING ?? 0,
        sending: countMap.SENDING ?? 0,
        sent: countMap.SENT ?? 0,
        failed: countMap.FAILED ?? 0,
      },
      selected: rows.length,
    },
  });
}

export async function POST(req: NextRequest) {
  const admin = await getSuperAdminUser();
  if (!admin) return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const action = text(body.action, 40).toUpperCase();
  const id = text(body.id, 100);

  if (action === "PROCESS_DUE") {
    const limit = Math.min(Math.max(Math.trunc(Number(body.limit) || 25), 1), 100);
    try {
      const result = await processDueOutboundEmails(limit);
      return NextResponse.json({ ok: true, action, ...result });
    } catch (error) {
      console.error("Super-admin outbox processing failed", error);
      return NextResponse.json({ error: "Unable to process the email outbox." }, { status: 500 });
    }
  }

  if (action === "REQUEUE_FAILED") {
    const updated = await prisma.$executeRaw(Prisma.sql`
      UPDATE EmailOutbox
      SET "status" = 'PENDING', "lockedAt" = NULL, "nextAttemptAt" = CURRENT_TIMESTAMP,
          "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "status" = 'FAILED'
    `);
    return NextResponse.json({ ok: true, action, updated });
  }

  if (action === "RETRY") {
    if (!id) return NextResponse.json({ error: "Outbox message ID is required." }, { status: 422 });
    const updated = await prisma.$executeRaw(Prisma.sql`
      UPDATE EmailOutbox
      SET "status" = 'PENDING', "lockedAt" = NULL, "nextAttemptAt" = CURRENT_TIMESTAMP,
          "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "status" != 'SENT'
    `);
    if (updated !== 1) {
      return NextResponse.json(
        { error: "Message was not found or is already sent." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, action, id });
  }

  return NextResponse.json({ error: "Unsupported outbox action." }, { status: 422 });
}
