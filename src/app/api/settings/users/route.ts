import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  // `approved` rides along so the Crew screen can split the list: the crew who can work
  // today, and the "waiting to join" members who came in through an open link and need the
  // owner's yes. A hand-added member and every member already on the desk are approved.
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, name: true, email: true, role: true, approved: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

/**
 * Approve a member who joined through an open link. Admin-only and tenant-scoped: the row
 * is found by id AND tenant first, so this can never reach across the workspace line to
 * approve a stranger's pending member. Idempotent — approving an already-approved member is
 * a no-op, not an error — and the approval takes effect on that member's next request,
 * because the jwt callback re-reads the flag every time (src/lib/auth.ts).
 *
 * Rejecting a pending member is just removing them: DELETE below already does it, scoped
 * the same way, so there is one delete door rather than two.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Nothing was picked to approve" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true, email: true, role: true, approved: true },
  });
  if (!target) {
    return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });
  }
  if (target.approved) {
    return NextResponse.json({ ...target, approved: true });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { approved: true },
    select: { id: true, name: true, email: true, role: true, approved: true, createdAt: true },
  });

  await record({
    tenantId,
    actor: { id: guard.identity.id },
    action: "user.approve",
    entity: "User",
    entityId: updated.id,
    summary: `Approved ${updated.name} (${updated.email}) into the crew as ${updated.role}`,
    meta: { role: updated.role, email: updated.email },
  });

  return NextResponse.json(updated);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();
  const password = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      tenantId,
      name: body.name,
      email: body.email,
      password,
      role: body.role || "WORKER",
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await record({
    tenantId,
    actor: { id: guard.identity.id },
    action: "user.add",
    entity: "User",
    entityId: user.id,
    summary: `Added ${user.name} (${user.email}) to the crew as ${user.role}`,
    meta: { role: user.role, email: user.email },
  });

  return NextResponse.json(user, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { tenantId, id: selfId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Nothing was picked to remove" }, { status: 400 });

  if (id === selfId) {
    return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });
  }

  // Scoped to this crew: an unscoped delete reached any user of any tenant, including
  // another company's only admin, which locks them out of their own workspace for good.
  // Name and email ride along so the journal can say who lost access, not just an id.
  const target = await prisma.user.findFirst({
    where: { id, tenantId },
    select: { role: true, name: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  if (target.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { tenantId, role: "ADMIN" } });
    if (admins <= 1) {
      return NextResponse.json({ error: "The last admin cannot be removed" }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id } });

  await record({
    tenantId,
    actor: { id: guard.identity.id },
    action: "user.remove",
    entity: "User",
    entityId: id,
    summary: `Removed ${target.name} (${target.email}, ${target.role}) from the crew`,
    meta: { role: target.role, email: target.email },
  });

  return NextResponse.json({ ok: true });
}
