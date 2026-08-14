import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { record } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Change your own password.
 *
 * Provisioning hands a new workspace a generated password and the runbook tells the
 * owner to change it — and there was nowhere to do it. The one that arrived over chat
 * stayed the password forever. Anyone signed in may change their OWN; setting someone
 * else's stays with the operator's script, so an admin cannot quietly take over a
 * crew member's account and act as them in the journal.
 */

/** Same floor as signup and provisioning. */
const MIN_LENGTH = 10;

export async function PUT(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { id: userId, tenantId } = guard.identity;

  // The current password is a password prompt like any other: throttle the guessing.
  const limited = rateLimit(`password:${userId}:${clientIp(req)}`, 10, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts — try again later" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const body = await req.json();
  const current = String(body.currentPassword ?? "");
  const next = String(body.newPassword ?? "");

  if (next.length < MIN_LENGTH)
    return NextResponse.json(
      { error: `Password must be at least ${MIN_LENGTH} characters` },
      { status: 400 }
    );
  if (next === current)
    return NextResponse.json({ error: "That is the password you already have" }, { status: 400 });

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, name: true, email: true, password: true },
  });
  if (!user) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  if (!(await bcrypt.compare(current, user.password)))
    return NextResponse.json({ error: "That is not your current password" }, { status: 403 });

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(next, 12) },
  });

  await record({
    tenantId,
    actor: guard.identity,
    action: "user.password_change",
    entity: "User",
    entityId: user.id,
    summary: `${user.name} (${user.email}) changed their own password`,
  });

  return NextResponse.json({ ok: true });
}
