import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";

/**
 * The journal, read-only. There is deliberately no POST, PUT or DELETE here: an
 * entry a party to the dispute can edit is worth nothing as evidence, so the only
 * writer is `record()` in @/lib/audit.
 *
 * Owner's desk only — the log names clients, totals and who took the cash.
 */

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity")?.trim();
  const entityId = searchParams.get("entityId")?.trim();
  const q = searchParams.get("q")?.trim();
  const cursor = searchParams.get("cursor")?.trim();
  const take = Math.min(Math.max(Number(searchParams.get("take")) || DEFAULT_TAKE, 1), MAX_TAKE);

  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId,
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
      ...(q ? { summary: { contains: q } } : {}),
    },
    // id breaks ties: two entries written in the same millisecond would otherwise
    // shuffle between pages and one of them would never be read.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // One row past the page answers "is there more" without a second count query.
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const entries = hasMore ? rows.slice(0, take) : rows;

  return NextResponse.json({
    entries,
    nextCursor: hasMore ? entries[entries.length - 1].id : null,
  });
}
