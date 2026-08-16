import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record } from "@/lib/audit";

/**
 * Revoke an invite. Admin-only and scoped to the caller's workspace: revoking is a stamp,
 * not a delete, so the row survives with `revokedAt` set and the list can still show that a
 * link existed and how many people it let in. An unscoped update could reach across the
 * tenant line to kill another workspace's link, so the row is found by id AND tenant first,
 * exactly like the crew delete beside it.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId, id: adminId } = guard.identity;

  const invite = await prisma.invite.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, email: true, role: true, revokedAt: true },
  });
  if (!invite) {
    return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });
  }
  if (invite.revokedAt) {
    // Already off — idempotent, so a double click is not an error.
    return NextResponse.json({ ok: true });
  }

  await prisma.invite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
  });

  await record({
    tenantId,
    actor: { id: adminId },
    action: "invite.revoke",
    entity: "Invite",
    entityId: invite.id,
    summary: invite.email
      ? `Revoked the invite for ${invite.email}`
      : `Revoked an open ${invite.role.toLowerCase()} join link`,
    meta: { email: invite.email, role: invite.role },
  });

  return NextResponse.json({ ok: true });
}
