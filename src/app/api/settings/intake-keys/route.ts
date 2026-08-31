import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { generateIntakeKey, hashIntakeKey } from "@/lib/intake";
import { LEAD_SOURCES, choice } from "@/lib/enums";

/**
 * The owner's side of landing intake. A key is a write credential for the workspace's
 * lead list, so it lives on the same shelf as the crew list — admins only.
 */

/** The key itself is never in this projection; only its digest exists after creation. */
const LIST_FIELDS = {
  id: true,
  label: true,
  source: true,
  isActive: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const keys = await prisma.intakeKey.findMany({
    where: { tenantId: guard.identity.tenantId },
    select: LIST_FIELDS,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(keys);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
  if (!label) return NextResponse.json({ error: "Name this channel" }, { status: 400 });

  const source = choice(
    LEAD_SOURCES,
    typeof body.source === "string" ? body.source.toUpperCase() : "OTHER"
  );
  if (!source) {
    return NextResponse.json({ error: "Unknown lead source", allowed: [...LEAD_SOURCES] }, { status: 400 });
  }

  const key = generateIntakeKey();
  const created = await prisma.intakeKey.create({
    data: { tenantId: guard.identity.tenantId, label, source, keyHash: hashIntakeKey(key) },
    select: LIST_FIELDS,
  });

  // The only moment the key exists outside the landing page's config. Losing it means
  // issuing a new one, which is the honest trade for storing a digest.
  return NextResponse.json({ ...created, key, path: `/api/intake/${key}` }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Nothing was picked to remove" }, { status: 400 });

  // Scoped delete: an id from another workspace must silence nobody else's landing page.
  const removed = await prisma.intakeKey.deleteMany({
    where: { id, tenantId: guard.identity.tenantId },
  });
  if (removed.count === 0)
    return NextResponse.json(
      { error: "That record is gone — it was deleted, or the link points at another workspace" },
      { status: 404 }
    );

  return NextResponse.json({ ok: true });
}
