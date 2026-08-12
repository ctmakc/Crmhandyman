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
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, identity: sessionTenant(session) };
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
      response: NextResponse.json({ error: "Admins only" }, { status: 403 }),
    };
  }
  return guard;
}
