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

  const identity = sessionTenant(session);
  // An empty identity is a revoked session — the user row is gone (or its tenant moved),
  // and the jwt callback stripped the token. Treat it exactly as signed out.
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
