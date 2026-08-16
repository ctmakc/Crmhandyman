import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record } from "@/lib/audit";
import { inviteUsable, joinUrl, newInviteToken } from "@/lib/invite";

/**
 * INVITES — the owner's two doors onto the crew, both admin-only.
 *
 * POST cuts a link: a NAMED invite (an email the owner typed → the person joins approved)
 * or an OPEN link (no email → whoever follows it joins and waits for approval). The
 * response hands back the token AND the full shareable URL, because the whole point is
 * that the owner copies a link and sends it however he likes — no email server involved.
 *
 * GET lists this workspace's live links with their use counts, so the owner can see who is
 * outstanding and revoke one. Everything is scoped to the caller's tenant; a worker gets
 * 403 and another workspace's invites are simply not in the list.
 */

const MAX_USES_CAP = 500;
const MAX_EXPIRY_DAYS = 365;

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId, tenantSlug } = guard.identity;

  const invites = await prisma.invite.findMany({
    where: { tenantId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      role: true,
      email: true,
      maxUses: true,
      uses: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  // The link is rebuilt for each row so the owner can re-copy it, and `usable` says whether
  // it still opens — an expired or used-up link stays in the list (revoked ones do not)
  // until the owner clears it, but it is shown as spent.
  const now = new Date();
  return NextResponse.json(
    invites.map((inv) => ({
      ...inv,
      url: joinUrl(tenantSlug, inv.token),
      usable: inviteUsable({ ...inv, revokedAt: null }, now),
    }))
  );
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId, tenantSlug, id: adminId } = guard.identity;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Nothing to create" }, { status: 400 });
  }

  // Role: WORKER unless the owner deliberately hands out ADMIN.
  const role = body.role === "ADMIN" ? "ADMIN" : "WORKER";

  // Email decides the shape. Present → a named invite for one person; absent → an open
  // link. A named invite for someone who already has a login here is a dead end, so it is
  // refused with a clear reason rather than minted and left to fail at the door.
  let email: string | null = null;
  if (body.email !== undefined && body.email !== null && String(body.email).trim() !== "") {
    email = String(body.email).trim().toLowerCase();
    if (!isEmail(email)) {
      return NextResponse.json({ error: "That email address is not valid" }, { status: 400 });
    }
    const already = await prisma.user.findUnique({
      where: { email_tenantId: { email, tenantId } },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json(
        { error: "That email already has a login on this desk" },
        { status: 409 }
      );
    }
  }

  // maxUses: null (or absent) is unlimited; a number is capped so a single link cannot be
  // turned into an unbounded account factory.
  let maxUses: number | null = null;
  if (body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== "") {
    const n = Math.trunc(Number(body.maxUses));
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json({ error: "Uses must be a whole number above zero, or left blank for unlimited" }, { status: 400 });
    }
    maxUses = Math.min(n, MAX_USES_CAP);
  }

  // Expiry: the UI sends a number of days (or nothing for never). Clamped so a link cannot
  // be dated centuries out.
  let expiresAt: Date | null = null;
  if (body.expiresInDays !== undefined && body.expiresInDays !== null && body.expiresInDays !== "") {
    const days = Math.trunc(Number(body.expiresInDays));
    if (!Number.isFinite(days) || days < 1) {
      return NextResponse.json({ error: "Expiry must be a whole number of days, or left blank for never" }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + Math.min(days, MAX_EXPIRY_DAYS) * 24 * 60 * 60 * 1000);
  }

  const invite = await prisma.invite.create({
    data: {
      tenantId,
      token: newInviteToken(),
      role,
      email,
      maxUses,
      expiresAt,
      createdById: adminId,
    },
    select: {
      id: true,
      token: true,
      role: true,
      email: true,
      maxUses: true,
      uses: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  await record({
    tenantId,
    actor: { id: adminId },
    action: "invite.create",
    entity: "Invite",
    entityId: invite.id,
    summary: email
      ? `Invited ${email} to join as ${role}`
      : `Created an open ${role.toLowerCase()} join link`,
    meta: { role, email, maxUses, expiresAt },
  });

  return NextResponse.json(
    { ...invite, url: joinUrl(tenantSlug, invite.token) },
    { status: 201 }
  );
}
