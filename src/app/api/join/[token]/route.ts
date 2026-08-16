import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { record } from "@/lib/audit";
import { inviteDeadReason, inviteUsable } from "@/lib/invite";

/**
 * THE JOIN DOOR — public, because the whole capability is the token in the path. No
 * session is read: whoever holds the link is who the owner meant to reach.
 *
 * GET validates the link and returns just enough to draw the page — the business name, the
 * role the joiner would get, and whether the email is locked (a named invite) or theirs to
 * type (an open link). POST accepts: it creates a User in that workspace with the invite's
 * role and a password the joiner sets. A NAMED invite (the owner typed the email) joins
 * approved and can work at once; an OPEN link joins approved=false and waits for the owner.
 *
 * Google is not a second door here. Because the row is created with exactly one email in
 * this one workspace, a later "Sign in with Google" on that address auto-links to it
 * through the path that already exists in src/lib/auth.ts — nothing new to build.
 *
 * A random token teaches a prober nothing (404); a real link that has been revoked, has
 * expired or is used up says so plainly (410), because the person holding it earned that
 * much. Tokens are 24 random bytes, so there is nothing to enumerate.
 */

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 10;

/** The invite plus the one workspace fact the join page shows. Null when there is nothing
 *  a stranger should be handed. */
async function loadInvite(token: string) {
  return prisma.invite.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      role: true,
      email: true,
      maxUses: true,
      uses: true,
      expiresAt: true,
      revokedAt: true,
      tenant: { select: { slug: true, businessName: true, status: true } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const invite = await loadInvite(params.token);
  // Unknown token, or a workspace that is not open for business: the same blank 404, so a
  // prober cannot tell a dead link from a made-up one, nor learn a workspace's state.
  if (!invite || invite.tenant.status !== "ACTIVE") {
    return NextResponse.json({ error: "This invite link is not valid" }, { status: 404 });
  }

  const dead = inviteDeadReason(invite);
  if (dead) return NextResponse.json({ error: dead }, { status: 410 });

  return NextResponse.json({
    businessName: invite.tenant.businessName,
    role: invite.role,
    // A named invite locks the address the owner typed; an open link lets the joiner type
    // their own. The page prefills and disables the field on the first, opens it on the
    // second.
    emailLocked: invite.email !== null,
    email: invite.email ?? undefined,
  });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const invite = await loadInvite(params.token);
  if (!invite || invite.tenant.status !== "ACTIVE") {
    return NextResponse.json({ error: "This invite link is not valid" }, { status: 404 });
  }
  const dead = inviteDeadReason(invite);
  if (dead) return NextResponse.json({ error: dead }, { status: 410 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Fill in your name and a password" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1) {
    return NextResponse.json({ error: "Enter your name" }, { status: 400 });
  }

  // The address is the invite's on a named link — the field is locked in the UI, and the
  // server does not trust the UI, so it uses the invite's email regardless of what was
  // posted. On an open link the joiner types their own, and it must be a real address.
  let email: string;
  if (invite.email) {
    email = invite.email;
  } else {
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  // Named = the owner vouched for this address, so they walk straight in. Open = they wait.
  const approved = invite.email !== null;

  /**
   * Everything that decides "did this person get in" happens in one transaction, because
   * better-sqlite3 runs writes one at a time: the invite is re-read and re-checked, the
   * email is reserved against a duplicate, the user is created and the use is counted — all
   * or nothing. Two people racing the last slot of a one-use link cannot both win, and a
   * create that fails on the email leaves no phantom use behind.
   */
  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.invite.findUnique({
      where: { id: invite.id },
      select: { id: true, revokedAt: true, expiresAt: true, maxUses: true, uses: true },
    });
    if (!fresh || !inviteUsable(fresh)) return { kind: "gone" as const };

    const clash = await tx.user.findUnique({
      where: { email_tenantId: { email, tenantId: invite.tenantId } },
      select: { id: true },
    });
    if (clash) return { kind: "exists" as const };

    const user = await tx.user.create({
      data: {
        tenantId: invite.tenantId,
        name,
        email,
        password: hashed,
        role: invite.role,
        approved,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    await tx.invite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
    return { kind: "ok" as const, user };
  });

  if (result.kind === "gone") {
    return NextResponse.json({ error: "This invite link is no longer available. Ask for a new one." }, { status: 410 });
  }
  if (result.kind === "exists") {
    return NextResponse.json(
      { error: "That email already has a login on this desk — sign in instead" },
      { status: 409 }
    );
  }

  await record({
    tenantId: invite.tenantId,
    actor: { id: result.user.id, name: result.user.name },
    action: "invite.accept",
    entity: "User",
    entityId: result.user.id,
    summary: approved
      ? `${result.user.name} (${result.user.email}) joined the crew as ${result.user.role}`
      : `${result.user.name} (${result.user.email}) asked to join as ${result.user.role} — awaiting approval`,
    meta: { role: result.user.role, email: result.user.email, approved, inviteId: invite.id },
  });

  /**
   * The page reads `approved` to decide what happens next: an approved joiner is signed in
   * on the client and lands on the desk; an open-link joiner is shown the "your request is
   * in" screen and is NOT signed in — when they do sign in they are parked on /awaiting
   * until the owner lets them through. `slug` is what the client signs in against.
   */
  return NextResponse.json(
    {
      ok: true,
      approved,
      slug: invite.tenant.slug,
      email: result.user.email,
      role: result.user.role,
      businessName: invite.tenant.businessName,
    },
    { status: 201 }
  );
}
