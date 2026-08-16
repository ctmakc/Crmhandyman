import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionTenant, type SessionIdentity } from "@/lib/session";

export type Guard =
  | { ok: true; identity: SessionIdentity }
  | { ok: false; response: NextResponse };

/** Any signed-in member of a workspace. */
export async function requireUser(): Promise<Guard> {
  const session = await getServerSession(authOptions);
  const signedOut = NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  if (!session) return { ok: false, response: signedOut };

  // Two kinds of session carry no desk, and both are refused before the identity is even
  // read: a REVOKED user (row gone) and an UNAPPROVED member (joined through an open link,
  // still waiting for the owner). The session callback zeroes the identity for each, so the
  // `!identity.id` line below already catches them — this names the refusal explicitly so
  // it cannot be skipped by a future change that ever carried a partial identity alongside
  // the flag. The jwt callback re-reads approval every request, so an approval opens the
  // desk on the next request, not the next login.
  const flags = session.user as unknown as { dead?: boolean; unapproved?: boolean } | undefined;
  if (flags?.dead || flags?.unapproved) return { ok: false, response: signedOut };

  const identity = sessionTenant(session);
  if (!identity.id || !identity.tenantId) return { ok: false, response: signedOut };

  return { ok: true, identity };
}

/**
 * The owner's desk. Money — the books, the collections, the accountant's export — is
 * not the field crew's business: a hired tech could read the whole P&L and download the
 * customer list, which is the one thing a contractor cannot afford to hand out.
 */
export async function requireAdmin(): Promise<Guard> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  if (guard.identity.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "The owner's login opens this" }, { status: 403 }),
    };
  }
  return guard;
}
